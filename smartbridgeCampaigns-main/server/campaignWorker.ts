import { storage } from "./storage";
import { sendEmail, generateTrackingToken, sendTransactionalEmail, createEmailSender, type SESConfig, type SMTPConfig, type EmailSender } from "./ses";
import { generateCampaignAlertEmailHtml } from "./aiService";
import type { CampaignJob, Subscriber } from "@shared/schema";

const activeJobs = new Map<string, { aborted: boolean }>();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Concurrent email sending limit - higher concurrency for faster throughput
// AWS SES production accounts typically support 14-50+ emails/sec depending on account history
const CONCURRENCY_LIMIT = 20;

// Target rate: 18 emails per second (tuned for high-throughput sending)
const TARGET_RATE = 18;
// Time window for rate calculation (how long a chunk should take at target rate)
const TARGET_CHUNK_MS = Math.ceil((CONCURRENCY_LIMIT / TARGET_RATE) * 1000); // ~1111ms for 20 emails at 18/sec

export async function startCampaignJob(
  jobId: string,
  campaignId: string,
  userId: string,
  baseUrl: string,
  ownerId: string
): Promise<void> {
  const jobControl = { aborted: false };
  activeJobs.set(jobId, jobControl);

  try {
    const job = await storage.getCampaignJob(jobId);
    if (!job) {
      console.error(`Job ${jobId} not found`);
      return;
    }

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign || !campaign.segmentId) {
      await storage.updateCampaignJob(jobId, {
        status: 'failed',
        lastError: 'Campaign or segment not found',
        finishedAt: new Date(),
      });
      return;
    }

    const creds = await storage.getSesCredentialsDecrypted(userId);
    if (!creds || !creds.isVerified) {
      await storage.updateCampaignJob(jobId, {
        status: 'failed',
        lastError: 'SES credentials not configured or email not verified',
        finishedAt: new Date(),
      });
      return;
    }

    // Sender identity is required for campaigns
    if (!campaign.senderIdentityId) {
      await storage.updateCampaignJob(jobId, {
        status: 'failed',
        lastError: 'No sender email address selected for this campaign',
        finishedAt: new Date(),
      });
      await storage.updateCampaign(campaignId, { status: 'failed' });
      return;
    }

    // Get and validate sender identity (must exist and be verified)
    const senderIdentity = await storage.getSenderIdentityForTenant(campaign.senderIdentityId, ownerId);
    if (!senderIdentity) {
      await storage.updateCampaignJob(jobId, {
        status: 'failed',
        lastError: 'Selected sender email address not found or no longer available',
        finishedAt: new Date(),
      });
      await storage.updateCampaign(campaignId, { status: 'failed' });
      return;
    }
    if (!senderIdentity.isVerified) {
      await storage.updateCampaignJob(jobId, {
        status: 'failed',
        lastError: 'Selected sender email is not verified in AWS SES',
        finishedAt: new Date(),
      });
      await storage.updateCampaign(campaignId, { status: 'failed' });
      return;
    }

    const senderEmail = senderIdentity.email;
    const senderName = senderIdentity.name;

    await storage.updateCampaignJob(jobId, {
      status: 'processing',
      startedAt: new Date(),
    });

    await storage.updateCampaign(campaignId, { status: 'sending' });

    sendCampaignAlerts('start', campaignId, userId, {
      totalRecipients: job.totalRecipients,
      startedAt: new Date(),
    });

    const batchSize = job.batchSize || 50;
    const totalRecipients = job.totalRecipients;
    const totalBatches = Math.ceil(totalRecipients / batchSize);

    let processedCount = 0;
    let sentCount = 0;
    let failedCount = 0;
    let batchNum = 0;
    let lastProcessedId: string | undefined = undefined;

    // Create reusable email sender ONCE to avoid TLS handshake overhead per email
    const protocol = (creds.protocol as 'api' | 'smtp') || 'api';
    const config = protocol === 'smtp'
      ? {
          host: creds.smtpHost!,
          port: creds.smtpPort!,
          user: creds.smtpUser!,
          password: creds.decryptedSmtpPassword!,
        }
      : {
          accessKeyId: creds.accessKeyId!,
          secretAccessKey: creds.decryptedSecretAccessKey!,
          region: creds.region!,
        };
    
    // Create sender once - reused for all emails in the campaign
    const emailSender = createEmailSender(protocol, config);

    // Use keyset pagination (cursor-based) for O(n) performance instead of O(n²) with OFFSET
    while (true) {
      if (jobControl.aborted) {
        await storage.updateCampaignJob(jobId, {
          status: 'paused',
          lastError: 'Job was manually paused',
        });
        await storage.updateCampaign(campaignId, { status: 'paused' });
        return;
      }

      // Fetch next batch using keyset pagination (tenant-aware)
      const subscribers = await storage.getSubscribersBySegmentAfterCursorForTenant(
        campaign.segmentId,
        ownerId,
        batchSize,
        lastProcessedId
      );

      if (subscribers.length === 0) break;

      // Process subscribers in parallel chunks of CONCURRENCY_LIMIT
      for (let i = 0; i < subscribers.length; i += CONCURRENCY_LIMIT) {
        if (jobControl.aborted) break;

        const chunk = subscribers.slice(i, i + CONCURRENCY_LIMIT);
        const chunkStart = Date.now();
        
        // Batch create all campaign messages upfront (single DB call instead of N calls)
        const messageData = chunk.map(subscriber => ({
          campaignId,
          subscriberId: subscriber.id,
          email: subscriber.email,
          status: 'pending' as const,
          trackingToken: generateTrackingToken(),
        }));
        
        const messages = await storage.createCampaignMessagesBatch(messageData);
        const messageMap = new Map(messages.map(m => [m.subscriberId, m]));
        
        const results = await Promise.allSettled(
          chunk.map(async (subscriber) => {
            const message = messageMap.get(subscriber.id)!;

            // Use reusable sender (no TLS handshake overhead)
            const result = await emailSender({
              to: subscriber.email,
              subject: campaign.subject,
              htmlBody: campaign.htmlContent || `<p>${campaign.subject}</p>`,
              fromEmail: senderEmail,
              fromName: senderName,
              trackingToken: message.trackingToken,
              baseUrl,
            });

            if (result.success) {
              // Fire-and-forget status update (don't block the send loop)
              storage.updateCampaignMessage(message.id, {
                status: 'sent',
                messageId: result.messageId,
                sentAt: new Date(),
              }).catch(err => console.error('Failed to update message status:', err));
              return { success: true, subscriberId: subscriber.id };
            } else {
              // Fire-and-forget status update
              storage.updateCampaignMessage(message.id, {
                status: 'failed',
              }).catch(err => console.error('Failed to update message status:', err));
              return { success: false, subscriberId: subscriber.id };
            }
          })
        );

        // Count results from parallel execution
        for (const result of results) {
          processedCount++;
          if (result.status === 'fulfilled' && result.value.success) {
            sentCount++;
          } else {
            failedCount++;
            if (result.status === 'rejected') {
              console.error('Email send error:', result.reason);
            }
          }
        }

        // Update lastProcessedId to the last subscriber in this chunk
        lastProcessedId = chunk[chunk.length - 1].id;

        // Elapsed-time-aware rate limiting: only pause if chunk finished faster than rate limit allows
        const chunkElapsed = Date.now() - chunkStart;
        const remainingDelay = TARGET_CHUNK_MS - chunkElapsed;
        
        // Only delay if we finished faster than the target rate allows
        if (remainingDelay > 0 && !jobControl.aborted) {
          await delay(remainingDelay);
        }
      }

      batchNum++;
      await storage.updateCampaignJob(jobId, {
        currentBatch: batchNum,
        processedCount,
        sentCount,
        failedCount,
      });
      // No additional delay between batches - rate limiting is handled per chunk
    }

    await storage.updateCampaignJob(jobId, {
      status: 'completed',
      processedCount,
      sentCount,
      failedCount,
      finishedAt: new Date(),
    });

    await storage.updateCampaign(campaignId, {
      status: 'completed',
      sentAt: new Date(),
      totalSent: sentCount,
      totalDelivered: sentCount,
    });

    // Wait 5 seconds to allow bounce notifications to come in before sending completion alert
    await delay(5000);
    
    // Fetch fresh campaign data to get updated bounce/complaint counts
    const updatedCampaign = await storage.getCampaign(campaignId);
    
    sendCampaignAlerts('completion', campaignId, userId, {
      totalRecipients,
      sentCount,
      failedCount,
      bouncedCount: updatedCampaign?.totalBounced || 0,
      complaintsCount: updatedCampaign?.totalComplaints || 0,
      completedAt: new Date(),
      status: 'completed',
    });

  } catch (error: any) {
    console.error(`Campaign job ${jobId} failed:`, error);
    await storage.updateCampaignJob(jobId, {
      status: 'failed',
      lastError: error.message || 'Unknown error',
      finishedAt: new Date(),
    });
    await storage.updateCampaign(campaignId, { status: 'failed' });
    
    sendCampaignAlerts('completion', campaignId, userId, {
      completedAt: new Date(),
      status: 'failed',
    });
  } finally {
    activeJobs.delete(jobId);
  }
}

export function pauseCampaignJob(jobId: string): boolean {
  const jobControl = activeJobs.get(jobId);
  if (jobControl) {
    jobControl.aborted = true;
    return true;
  }
  return false;
}

export function isJobActive(jobId: string): boolean {
  return activeJobs.has(jobId);
}

export async function sendCampaignAlerts(
  alertType: 'start' | 'completion',
  campaignId: string,
  userId: string,
  stats: {
    totalRecipients?: number;
    sentCount?: number;
    failedCount?: number;
    bouncedCount?: number;
    complaintsCount?: number;
    startedAt?: Date;
    completedAt?: Date;
    status?: string;
  }
): Promise<void> {
  try {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      console.error(`Campaign ${campaignId} not found for alerts`);
      return;
    }

    const owner = await storage.resolveOwnerForUser(userId);
    if (!owner) {
      console.error(`Owner not found for user ${userId}`);
      return;
    }

    const creds = await storage.getSesCredentialsDecrypted(owner.id);
    if (!creds || !creds.isVerified) {
      console.error(`SES credentials not configured for sending alerts`);
      return;
    }

    const segment = campaign.segmentId ? await storage.getSegment(campaign.segmentId) : null;
    const segmentName = segment?.name || 'All Subscribers';

    const alertUsers = await storage.getUsersForAlerts(owner.id);

    const htmlBody = generateCampaignAlertEmailHtml(alertType, campaign.name, segmentName, stats);
    const subject = alertType === 'start' 
      ? `[SmartBridge] Campaign Started: ${campaign.name}`
      : `[SmartBridge] Campaign ${stats.status === 'completed' ? 'Completed' : 'Finished'}: ${campaign.name}`;

    const protocol = (creds.protocol as 'api' | 'smtp') || 'api';
    const config = protocol === 'smtp'
      ? {
          host: creds.smtpHost!,
          port: creds.smtpPort!,
          user: creds.smtpUser!,
          password: creds.decryptedSmtpPassword!,
        } as SMTPConfig
      : {
          accessKeyId: creds.accessKeyId!,
          secretAccessKey: creds.decryptedSecretAccessKey!,
          region: creds.region!,
        } as SESConfig;

    for (const user of alertUsers) {
      try {
        await sendTransactionalEmail(protocol, config, {
          to: user.email,
          subject,
          htmlBody,
          fromEmail: creds.fromEmail,
          fromName: creds.fromName,
        });
        console.log(`Sent ${alertType} alert to ${user.email} for campaign ${campaign.name}`);
      } catch (err) {
        console.error(`Failed to send ${alertType} alert to ${user.email}:`, err);
      }
    }
  } catch (error) {
    console.error(`Failed to send campaign alerts:`, error);
  }
}

let schedulerInterval: NodeJS.Timeout | null = null;

export function startCampaignScheduler(baseUrl: string): void {
  if (schedulerInterval) {
    console.log('Campaign scheduler already running');
    return;
  }

  console.log('Starting campaign scheduler...');
  
  schedulerInterval = setInterval(async () => {
    try {
      const dueCampaigns = await storage.getScheduledCampaignsDue();
      
      for (const campaign of dueCampaigns) {
        if (!campaign.userId || !campaign.segmentId) continue;
        
        console.log(`Processing scheduled campaign: ${campaign.name}`);
        
        // Get ownerId for tenant-based access
        const campaignCreator = await storage.getUser(campaign.userId);
        if (!campaignCreator) {
          console.log(`Skipping campaign ${campaign.name}: creator not found`);
          continue;
        }
        const ownerId = campaignCreator.ownerId || campaignCreator.id;
        
        const totalRecipients = await storage.getSubscribersBySegmentCountForTenant(campaign.segmentId, ownerId);
        
        if (totalRecipients === 0) {
          console.log(`Skipping campaign ${campaign.name}: no subscribers in segment`);
          await storage.updateCampaign(campaign.id, { status: 'failed' });
          continue;
        }

        const batchSize = 50;
        const totalBatches = Math.ceil(totalRecipients / batchSize);

        const job = await storage.createCampaignJob({
          campaignId: campaign.id,
          userId: campaign.userId,
          status: 'pending',
          totalRecipients,
          totalBatches,
          batchSize,
          delayBetweenBatches: 1000,
        });

        startCampaignJob(job.id, campaign.id, campaign.userId, baseUrl, ownerId);
        
        console.log(`Started scheduled campaign: ${campaign.name}`);
      }
    } catch (error) {
      console.error('Error in campaign scheduler:', error);
    }
  }, 60000);
}

export function stopCampaignScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Campaign scheduler stopped');
  }
}
