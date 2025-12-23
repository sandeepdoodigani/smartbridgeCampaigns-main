import { 
  type User,
  type InsertUser,
  type SesCredentials,
  type InsertSesCredentials,
  type SenderIdentity,
  type InsertSenderIdentity,
  type Subscriber, 
  type InsertSubscriber,
  type Segment,
  type InsertSegment,
  type Campaign,
  type InsertCampaign,
  type CampaignMessage,
  type InsertCampaignMessage,
  type EmailEvent,
  type InsertEmailEvent,
  type CampaignJob,
  type InsertCampaignJob,
  type TestEmailLog,
  type InsertTestEmailLog,
  type AuditLog,
  type InsertAuditLog,
  users,
  sesCredentials,
  senderIdentities,
  subscribers,
  segments,
  campaigns,
  campaignMessages,
  emailEvents,
  campaignJobs,
  testEmailLogs,
  auditLogs
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, and, sql, count, or, inArray } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto";

export interface SegmentRules {
  type: 'all' | 'tags_any' | 'tags_all';
  tags?: string[];
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser & { ownerId?: string }): Promise<User>;
  createUserWithOwner(user: InsertUser, creatorId: string): Promise<User>;
  listUsers(ownerId?: string): Promise<Omit<User, 'password'>[]>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getOwner(): Promise<User | undefined>;
  isUserOwner(userId: string): Promise<boolean>;
  resolveOwnerForUser(userId: string): Promise<User | undefined>;
  
  // SES Credentials (uses owner's credentials for all users)
  getSesCredentials(userId: string): Promise<SesCredentials | undefined>;
  getOwnerSesCredentials(): Promise<SesCredentials | undefined>;
  getSesCredentialsDecrypted(userId: string): Promise<(SesCredentials & { decryptedSecretAccessKey?: string; decryptedSmtpPassword?: string }) | undefined>;
  getOwnerSesCredentialsDecrypted(): Promise<(SesCredentials & { decryptedSecretAccessKey?: string; decryptedSmtpPassword?: string }) | undefined>;
  saveSesCredentials(credentials: InsertSesCredentials): Promise<SesCredentials>;
  updateSesCredentials(userId: string, data: Partial<InsertSesCredentials & { isVerified?: boolean }>): Promise<SesCredentials | undefined>;
  
  // Sender Identities (tenant-scoped)
  getSenderIdentities(ownerId: string): Promise<SenderIdentity[]>;
  getSenderIdentity(id: string): Promise<SenderIdentity | undefined>;
  getSenderIdentityForTenant(id: string, ownerId: string): Promise<SenderIdentity | undefined>;
  createSenderIdentity(identity: InsertSenderIdentity): Promise<SenderIdentity>;
  updateSenderIdentity(id: string, ownerId: string, data: Partial<InsertSenderIdentity & { isVerified?: boolean }>): Promise<SenderIdentity | undefined>;
  deleteSenderIdentity(id: string, ownerId: string): Promise<boolean>;
  deactivateSenderIdentity(id: string, ownerId: string): Promise<SenderIdentity | undefined>;
  activateSenderIdentity(id: string, ownerId: string): Promise<SenderIdentity | undefined>;
  setDefaultSenderIdentity(id: string, ownerId: string): Promise<boolean>;
  getDefaultSenderIdentity(ownerId: string): Promise<SenderIdentity | undefined>;
  
  // Subscribers
  getSubscribers(userId?: string): Promise<Subscriber[]>;
  getSubscriber(id: string): Promise<Subscriber | undefined>;
  getSubscriberByEmail(email: string, userId?: string): Promise<Subscriber | undefined>;
  createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber>;
  bulkCreateSubscribers(subscriberList: InsertSubscriber[]): Promise<{ created: Subscriber[], updated: Subscriber[] }>;
  updateSubscriber(id: string, data: Partial<InsertSubscriber>): Promise<Subscriber | undefined>;
  deleteSubscriber(id: string): Promise<boolean>;
  deleteSubscribersByTagForTenant(tag: string, ownerId: string): Promise<number>;
  removeTagFromAllSubscribersForTenant(tag: string, ownerId: string): Promise<number>;
  getSubscribersBySegment(segmentId: string, userId: string): Promise<Subscriber[]>;
  getAllUniqueTags(userId: string): Promise<string[]>;
  
  // Segments
  getSegments(userId?: string): Promise<Segment[]>;
  getSegmentsForTenant(ownerId: string): Promise<Segment[]>;
  getSegment(id: string): Promise<Segment | undefined>;
  createSegment(segment: InsertSegment): Promise<Segment>;
  updateSegment(id: string, data: Partial<InsertSegment>): Promise<Segment | undefined>;
  deleteSegment(id: string): Promise<boolean>;
  getSegmentSubscriberCount(segmentId: string, userId?: string): Promise<number>;
  
  // Tenant-aware methods
  getTenantUserIds(ownerId: string): Promise<string[]>;
  getSubscribersForTenant(ownerId: string): Promise<Subscriber[]>;
  getSubscribersBySegmentForTenant(segmentId: string, ownerId: string): Promise<Subscriber[]>;
  getSubscribersBySegmentCountForTenant(segmentId: string, ownerId: string): Promise<number>;
  getSubscribersAfterCursorForTenant(ownerId: string, limit: number, afterId?: string): Promise<Subscriber[]>;
  getSubscribersBySegmentAfterCursorForTenant(segmentId: string, ownerId: string, limit: number, afterId?: string): Promise<Subscriber[]>;
  
  // Campaigns
  getCampaigns(userId?: string): Promise<Campaign[]>;
  getCampaignsForTenant(ownerId: string): Promise<(Campaign & { creatorName: string })[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, data: Partial<InsertCampaign & { sentAt?: Date }>): Promise<Campaign | undefined>;
  updateCampaignTestEmailSent(id: string): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<boolean>;
  
  // Campaign Messages
  getCampaignMessages(campaignId: string): Promise<CampaignMessage[]>;
  getCampaignMessage(id: string): Promise<CampaignMessage | undefined>;
  getCampaignMessageByToken(token: string): Promise<CampaignMessage | undefined>;
  getCampaignMessageBySesId(messageId: string): Promise<CampaignMessage | undefined>;
  createCampaignMessage(message: InsertCampaignMessage): Promise<CampaignMessage>;
  createCampaignMessagesBatch(messages: InsertCampaignMessage[]): Promise<CampaignMessage[]>;
  updateCampaignMessage(id: string, data: Partial<CampaignMessage>): Promise<CampaignMessage | undefined>;
  
  // Email Events
  createEmailEvent(event: InsertEmailEvent): Promise<EmailEvent>;
  getEmailEvents(campaignMessageId: string): Promise<EmailEvent[]>;
  
  // Campaign Jobs
  createCampaignJob(job: InsertCampaignJob): Promise<CampaignJob>;
  getCampaignJob(id: string): Promise<CampaignJob | undefined>;
  getCampaignJobByCampaign(campaignId: string): Promise<CampaignJob | undefined>;
  updateCampaignJob(id: string, data: Partial<CampaignJob>): Promise<CampaignJob | undefined>;
  getActiveCampaignJobs(): Promise<CampaignJob[]>;
  
  // Test Email Logs
  createTestEmailLog(log: InsertTestEmailLog): Promise<TestEmailLog>;
  getTestEmailLogs(campaignId: string): Promise<(TestEmailLog & { senderUserName?: string })[]>;
  
  // Paginated Subscribers
  getSubscribersPaginated(userId: string, limit: number, offset: number): Promise<Subscriber[]>;
  getSubscribersCount(userId: string): Promise<number>;
  getSubscribersBySegmentPaginated(segmentId: string, userId: string, limit: number, offset: number): Promise<Subscriber[]>;
  getSubscribersBySegmentCount(segmentId: string, userId: string): Promise<number>;
  
  // Keyset pagination for large datasets
  getSubscribersAfterCursor(userId: string, limit: number, afterId?: string): Promise<Subscriber[]>;
  getSubscribersBySegmentAfterCursor(segmentId: string, userId: string, limit: number, afterId?: string): Promise<Subscriber[]>;
  
  // Page-based pagination for UI
  getSubscribersPaged(userId: string, page: number, limit: number, search?: string): Promise<{
    subscribers: Subscriber[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getSubscribersPagedForTenant(ownerId: string, page: number, limit: number, search?: string, filters?: { status?: string; tag?: string }): Promise<{
    subscribers: Subscriber[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getAllUniqueTagsForTenant(ownerId: string): Promise<string[]>;
  
  // Get users for notifications (admin and associates of an owner)
  getUsersForAlerts(ownerId: string): Promise<Omit<User, 'password'>[]>;
  
  // Scheduled campaigns
  getScheduledCampaignsDue(): Promise<Campaign[]>;
  
  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(userId?: string, filters?: {
    category?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    resourceType?: string;
    resourceId?: string;
  }): Promise<AuditLog[]>;
  getAuditLogsPaged(userId: string | undefined, page: number, limit: number, filters?: {
    category?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    search?: string;
  }): Promise<{
    logs: AuditLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser & { ownerId?: string }): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async createUserWithOwner(user: InsertUser, creatorId: string): Promise<User> {
    const creator = await this.getUser(creatorId);
    if (!creator) throw new Error("Creator not found");
    
    const ownerId = creator.isOwner ? creator.id : creator.ownerId;
    if (!ownerId) throw new Error("Could not determine owner for new user");
    
    const result = await db.insert(users).values({ ...user, ownerId }).returning();
    return result[0];
  }

  async listUsers(ownerId?: string): Promise<Omit<User, 'password'>[]> {
    const result = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isOwner: users.isOwner,
      ownerId: users.ownerId,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt));
    
    if (ownerId) {
      return result.filter(u => u.isOwner && u.id === ownerId || u.ownerId === ownerId);
    }
    return result;
  }

  async getOwner(): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.isOwner, true)).limit(1);
    return result[0];
  }

  async isUserOwner(userId: string): Promise<boolean> {
    const result = await db.select().from(users).where(and(eq(users.id, userId), eq(users.isOwner, true))).limit(1);
    return result.length > 0;
  }

  async resolveOwnerForUser(userId: string): Promise<User | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    
    if (user.isOwner) return user;
    
    if (user.ownerId) {
      return this.getUser(user.ownerId);
    }
    
    return undefined;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  // SES Credentials - Owner's credentials are shared with all users in their organization
  async getOwnerSesCredentials(): Promise<SesCredentials | undefined> {
    const owner = await this.getOwner();
    if (!owner) return undefined;
    const result = await db.select().from(sesCredentials).where(eq(sesCredentials.userId, owner.id)).limit(1);
    return result[0];
  }

  async getSesCredentials(userId: string): Promise<SesCredentials | undefined> {
    // Resolve the owner for this user and return their credentials
    const owner = await this.resolveOwnerForUser(userId);
    if (!owner) return undefined;
    
    const result = await db.select().from(sesCredentials).where(eq(sesCredentials.userId, owner.id)).limit(1);
    return result[0];
  }

  async getOwnerSesCredentialsDecrypted(): Promise<(SesCredentials & { decryptedSecretAccessKey?: string; decryptedSmtpPassword?: string }) | undefined> {
    const creds = await this.getOwnerSesCredentials();
    if (!creds) return undefined;
    
    try {
      const result: SesCredentials & { decryptedSecretAccessKey?: string; decryptedSmtpPassword?: string } = { ...creds };
      
      if (creds.protocol === 'api' && creds.secretAccessKey) {
        result.decryptedSecretAccessKey = decrypt(creds.secretAccessKey);
      }
      if (creds.protocol === 'smtp' && creds.smtpPassword) {
        result.decryptedSmtpPassword = decrypt(creds.smtpPassword);
      }
      
      return result;
    } catch (error) {
      console.error("Failed to decrypt credentials:", error);
      return undefined;
    }
  }

  async getSesCredentialsDecrypted(userId: string): Promise<(SesCredentials & { decryptedSecretAccessKey?: string; decryptedSmtpPassword?: string }) | undefined> {
    // Resolve the owner for this user and return their decrypted credentials
    const owner = await this.resolveOwnerForUser(userId);
    if (!owner) return undefined;
    
    const result = await db.select().from(sesCredentials).where(eq(sesCredentials.userId, owner.id)).limit(1);
    const creds = result[0];
    if (!creds) return undefined;
    
    try {
      const decrypted: SesCredentials & { decryptedSecretAccessKey?: string; decryptedSmtpPassword?: string } = { ...creds };
      
      if (creds.protocol === 'api' && creds.secretAccessKey) {
        decrypted.decryptedSecretAccessKey = decrypt(creds.secretAccessKey);
      }
      if (creds.protocol === 'smtp' && creds.smtpPassword) {
        decrypted.decryptedSmtpPassword = decrypt(creds.smtpPassword);
      }
      
      return decrypted;
    } catch (error) {
      console.error("Failed to decrypt credentials:", error);
      return undefined;
    }
  }

  async saveSesCredentials(credentials: InsertSesCredentials): Promise<SesCredentials> {
    const encryptedCredentials: any = { ...credentials };
    
    if (credentials.secretAccessKey) {
      encryptedCredentials.secretAccessKey = encrypt(credentials.secretAccessKey);
    }
    if (credentials.smtpPassword) {
      encryptedCredentials.smtpPassword = encrypt(credentials.smtpPassword);
    }
    
    const existing = await this.getSesCredentials(credentials.userId);
    if (existing) {
      const result = await db.update(sesCredentials)
        .set({ ...encryptedCredentials, updatedAt: new Date() })
        .where(eq(sesCredentials.userId, credentials.userId))
        .returning();
      return result[0];
    }
    const result = await db.insert(sesCredentials).values(encryptedCredentials).returning();
    return result[0];
  }

  async updateSesCredentials(userId: string, data: Partial<InsertSesCredentials & { isVerified?: boolean }>): Promise<SesCredentials | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.secretAccessKey) {
      updateData.secretAccessKey = encrypt(data.secretAccessKey);
    }
    const result = await db.update(sesCredentials)
      .set(updateData)
      .where(eq(sesCredentials.userId, userId))
      .returning();
    return result[0];
  }

  // Sender Identities (tenant-scoped)
  async getSenderIdentities(ownerId: string): Promise<SenderIdentity[]> {
    return db.select().from(senderIdentities)
      .where(eq(senderIdentities.ownerId, ownerId))
      .orderBy(desc(senderIdentities.createdAt));
  }

  async getSenderIdentity(id: string): Promise<SenderIdentity | undefined> {
    const result = await db.select().from(senderIdentities)
      .where(eq(senderIdentities.id, id))
      .limit(1);
    return result[0];
  }

  async getSenderIdentityForTenant(id: string, ownerId: string): Promise<SenderIdentity | undefined> {
    const result = await db.select().from(senderIdentities)
      .where(and(eq(senderIdentities.id, id), eq(senderIdentities.ownerId, ownerId)))
      .limit(1);
    return result[0];
  }

  async createSenderIdentity(identity: InsertSenderIdentity): Promise<SenderIdentity> {
    const result = await db.insert(senderIdentities).values(identity).returning();
    return result[0];
  }

  async updateSenderIdentity(id: string, ownerId: string, data: Partial<InsertSenderIdentity & { isVerified?: boolean }>): Promise<SenderIdentity | undefined> {
    const result = await db.update(senderIdentities)
      .set(data)
      .where(and(eq(senderIdentities.id, id), eq(senderIdentities.ownerId, ownerId)))
      .returning();
    return result[0];
  }

  async deleteSenderIdentity(id: string, ownerId: string): Promise<boolean> {
    const result = await db.delete(senderIdentities)
      .where(and(eq(senderIdentities.id, id), eq(senderIdentities.ownerId, ownerId)))
      .returning();
    return result.length > 0;
  }

  async deactivateSenderIdentity(id: string, ownerId: string): Promise<SenderIdentity | undefined> {
    const result = await db.update(senderIdentities)
      .set({ isActive: false })
      .where(and(eq(senderIdentities.id, id), eq(senderIdentities.ownerId, ownerId)))
      .returning();
    return result[0];
  }

  async activateSenderIdentity(id: string, ownerId: string): Promise<SenderIdentity | undefined> {
    const result = await db.update(senderIdentities)
      .set({ isActive: true })
      .where(and(eq(senderIdentities.id, id), eq(senderIdentities.ownerId, ownerId)))
      .returning();
    return result[0];
  }

  async setDefaultSenderIdentity(id: string, ownerId: string): Promise<boolean> {
    // First, unset all defaults for this owner
    await db.update(senderIdentities)
      .set({ isDefault: false })
      .where(eq(senderIdentities.ownerId, ownerId));
    
    // Then set the new default
    const result = await db.update(senderIdentities)
      .set({ isDefault: true })
      .where(and(eq(senderIdentities.id, id), eq(senderIdentities.ownerId, ownerId)))
      .returning();
    return result.length > 0;
  }

  async getDefaultSenderIdentity(ownerId: string): Promise<SenderIdentity | undefined> {
    const result = await db.select().from(senderIdentities)
      .where(and(eq(senderIdentities.ownerId, ownerId), eq(senderIdentities.isDefault, true)))
      .limit(1);
    return result[0];
  }

  // Subscribers
  async getSubscribers(userId?: string): Promise<Subscriber[]> {
    if (userId) {
      return db.select().from(subscribers).where(eq(subscribers.userId, userId)).orderBy(desc(subscribers.addedAt));
    }
    return db.select().from(subscribers).orderBy(desc(subscribers.addedAt));
  }

  async getSubscriber(id: string): Promise<Subscriber | undefined> {
    const result = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
    return result[0];
  }

  async getSubscriberByEmail(email: string, userId?: string): Promise<Subscriber | undefined> {
    const normalizedEmail = email.toLowerCase().trim();
    if (userId) {
      const result = await db.select().from(subscribers)
        .where(and(sql`LOWER(${subscribers.email}) = ${normalizedEmail}`, eq(subscribers.userId, userId)))
        .limit(1);
      return result[0];
    }
    const result = await db.select().from(subscribers)
      .where(sql`LOWER(${subscribers.email}) = ${normalizedEmail}`)
      .limit(1);
    return result[0];
  }

  async createSubscriber(subscriber: InsertSubscriber): Promise<Subscriber> {
    const result = await db.insert(subscribers).values(subscriber).returning();
    return result[0];
  }

  async bulkCreateSubscribers(subscriberList: InsertSubscriber[]): Promise<{ created: Subscriber[], updated: Subscriber[] }> {
    if (subscriberList.length === 0) return { created: [], updated: [] };
    
    const created: Subscriber[] = [];
    const updated: Subscriber[] = [];
    
    for (const sub of subscriberList) {
      const existing = await this.getSubscriberByEmail(sub.email, sub.userId || undefined);
      
      if (existing) {
        const existingTags = existing.tags || [];
        const newTags = sub.tags || [];
        const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
        
        const updatedSub = await this.updateSubscriber(existing.id, {
          tags: mergedTags,
          firstName: sub.firstName || existing.firstName,
          lastName: sub.lastName || existing.lastName,
        });
        if (updatedSub) {
          updated.push(updatedSub);
        }
      } else {
        const newSub = await this.createSubscriber(sub);
        created.push(newSub);
      }
    }
    
    return { created, updated };
  }

  async updateSubscriber(id: string, data: Partial<InsertSubscriber>): Promise<Subscriber | undefined> {
    const result = await db.update(subscribers).set(data).where(eq(subscribers.id, id)).returning();
    return result[0];
  }

  async deleteSubscriber(id: string): Promise<boolean> {
    const result = await db.delete(subscribers).where(eq(subscribers.id, id)).returning();
    return result.length > 0;
  }

  async deleteSubscribersByTagForTenant(tag: string, ownerId: string): Promise<number> {
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (tenantUserIds.length === 0) return 0;
    
    const result = await db.delete(subscribers)
      .where(and(
        inArray(subscribers.userId, tenantUserIds),
        sql`${tag} = ANY(${subscribers.tags})`
      ))
      .returning();
    
    return result.length;
  }

  async removeTagFromAllSubscribersForTenant(tag: string, ownerId: string): Promise<number> {
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (tenantUserIds.length === 0) return 0;
    
    const result = await db.update(subscribers)
      .set({ 
        tags: sql`array_remove(${subscribers.tags}, ${tag})` 
      })
      .where(and(
        inArray(subscribers.userId, tenantUserIds),
        sql`${tag} = ANY(${subscribers.tags})`
      ))
      .returning();
    
    return result.length;
  }

  async getSubscribersBySegment(segmentId: string, userId: string): Promise<Subscriber[]> {
    const segment = await this.getSegment(segmentId);
    if (!segment) return [];
    
    if (segment.userId !== userId) {
      console.warn(`User ${userId} attempted to access segment ${segmentId} owned by ${segment.userId}`);
      return [];
    }
    
    const allSubs = await this.getSubscribers(userId);
    const activeSubs = allSubs.filter(s => s.status === 'active');
    
    let rules: SegmentRules;
    try {
      const rawRules = typeof segment.rules === 'string' 
        ? JSON.parse(segment.rules) 
        : segment.rules;
      rules = {
        type: rawRules?.type || 'all',
        tags: Array.isArray(rawRules?.tags) ? rawRules.tags : [],
      };
    } catch {
      rules = { type: 'all', tags: [] };
    }
    
    if (rules.type === 'all') {
      return activeSubs;
    }
    
    if (rules.type === 'tags_any' && rules.tags && rules.tags.length > 0) {
      return activeSubs.filter(sub => 
        sub.tags && sub.tags.length > 0 && sub.tags.some(tag => rules.tags!.includes(tag))
      );
    }
    
    if (rules.type === 'tags_all' && rules.tags && rules.tags.length > 0) {
      return activeSubs.filter(sub => 
        sub.tags && sub.tags.length > 0 && rules.tags!.every(tag => sub.tags.includes(tag))
      );
    }
    
    return activeSubs;
  }

  async getAllUniqueTags(userId: string): Promise<string[]> {
    const allSubs = await this.getSubscribers(userId);
    const tagSet = new Set<string>();
    for (const sub of allSubs) {
      if (sub.tags) {
        sub.tags.forEach(tag => tagSet.add(tag));
      }
    }
    return Array.from(tagSet).sort();
  }

  // Segments
  async getSegments(userId?: string): Promise<Segment[]> {
    if (userId) {
      return db.select().from(segments).where(eq(segments.userId, userId)).orderBy(desc(segments.createdAt));
    }
    return db.select().from(segments).orderBy(desc(segments.createdAt));
  }

  async getSegment(id: string): Promise<Segment | undefined> {
    const result = await db.select().from(segments).where(eq(segments.id, id)).limit(1);
    return result[0];
  }

  async createSegment(segment: InsertSegment): Promise<Segment> {
    const result = await db.insert(segments).values(segment).returning();
    return result[0];
  }

  async updateSegment(id: string, data: Partial<InsertSegment>): Promise<Segment | undefined> {
    const result = await db.update(segments).set(data).where(eq(segments.id, id)).returning();
    return result[0];
  }

  async deleteSegment(id: string): Promise<boolean> {
    const result = await db.delete(segments).where(eq(segments.id, id)).returning();
    return result.length > 0;
  }

  async getSegmentSubscriberCount(segmentId: string, userId?: string): Promise<number> {
    if (!userId) {
      const allSubs = await this.getSubscribers();
      return allSubs.filter(s => s.status === 'active').length;
    }
    const segmentSubs = await this.getSubscribersBySegment(segmentId, userId);
    return segmentSubs.length;
  }

  async getSegmentsForTenant(ownerId: string): Promise<Segment[]> {
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (tenantUserIds.length === 0) return [];
    return db.select().from(segments).where(inArray(segments.userId, tenantUserIds)).orderBy(desc(segments.createdAt));
  }

  // Tenant-aware methods
  async getTenantUserIds(ownerId: string): Promise<string[]> {
    // First verify that ownerId corresponds to a valid owner
    const owner = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
    if (owner.length === 0) {
      return [];
    }
    
    // Get the owner and all users who belong to this owner
    // The owner is identified by isOwner=true, and all users in the tenant have ownerId pointing to this owner
    const tenantUsers = await db.select().from(users).where(
      or(eq(users.id, ownerId), eq(users.ownerId, ownerId))
    );
    
    // Filter to ensure we only return users that actually belong to this tenant
    // This prevents cross-tenant leakage for edge cases
    return tenantUsers
      .filter(u => u.id === ownerId || u.ownerId === ownerId)
      .map(u => u.id);
  }

  async getSubscribersForTenant(ownerId: string): Promise<Subscriber[]> {
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (tenantUserIds.length === 0) return [];
    return db.select().from(subscribers)
      .where(inArray(subscribers.userId, tenantUserIds))
      .orderBy(desc(subscribers.id));
  }

  async getSubscribersBySegmentForTenant(segmentId: string, ownerId: string): Promise<Subscriber[]> {
    const segment = await this.getSegment(segmentId);
    if (!segment) return [];
    
    // Verify segment belongs to tenant
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (!tenantUserIds.includes(segment.userId!)) {
      console.warn(`Segment ${segmentId} does not belong to tenant ${ownerId}`);
      return [];
    }
    
    // Get all active subscribers for the tenant
    const allSubs = await this.getSubscribersForTenant(ownerId);
    const activeSubs = allSubs.filter(s => s.status === 'active');
    
    let rules: SegmentRules;
    try {
      const rawRules = typeof segment.rules === 'string' 
        ? JSON.parse(segment.rules) 
        : segment.rules;
      rules = {
        type: rawRules?.type || 'all',
        tags: Array.isArray(rawRules?.tags) ? rawRules.tags : [],
      };
    } catch {
      rules = { type: 'all', tags: [] };
    }
    
    if (rules.type === 'all') {
      return activeSubs;
    }
    
    if (rules.type === 'tags_any' && rules.tags && rules.tags.length > 0) {
      return activeSubs.filter(sub => 
        sub.tags && sub.tags.length > 0 && sub.tags.some(tag => rules.tags!.includes(tag))
      );
    }
    
    if (rules.type === 'tags_all' && rules.tags && rules.tags.length > 0) {
      return activeSubs.filter(sub => 
        sub.tags && sub.tags.length > 0 && rules.tags!.every(tag => sub.tags.includes(tag))
      );
    }
    
    return activeSubs;
  }

  async getSubscribersBySegmentCountForTenant(segmentId: string, ownerId: string): Promise<number> {
    const segmentSubs = await this.getSubscribersBySegmentForTenant(segmentId, ownerId);
    return segmentSubs.length;
  }

  async getSubscribersAfterCursorForTenant(ownerId: string, limit: number, afterId?: string): Promise<Subscriber[]> {
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (tenantUserIds.length === 0) return [];
    
    if (afterId) {
      return db.select().from(subscribers)
        .where(and(
          inArray(subscribers.userId, tenantUserIds), 
          eq(subscribers.status, 'active'),
          sql`${subscribers.id} > ${afterId}`
        ))
        .orderBy(subscribers.id)
        .limit(limit);
    }
    return db.select().from(subscribers)
      .where(and(inArray(subscribers.userId, tenantUserIds), eq(subscribers.status, 'active')))
      .orderBy(subscribers.id)
      .limit(limit);
  }

  async getSubscribersBySegmentAfterCursorForTenant(segmentId: string, ownerId: string, limit: number, afterId?: string): Promise<Subscriber[]> {
    const segment = await this.getSegment(segmentId);
    if (!segment) return [];
    
    // Verify segment belongs to tenant
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (!tenantUserIds.includes(segment.userId!)) return [];
    
    let rules: SegmentRules;
    try {
      const rawRules = typeof segment.rules === 'string' 
        ? JSON.parse(segment.rules) 
        : segment.rules;
      rules = {
        type: rawRules?.type || 'all',
        tags: Array.isArray(rawRules?.tags) ? rawRules.tags : [],
      };
    } catch {
      rules = { type: 'all', tags: [] };
    }
    
    // For "all" segment type, use direct keyset pagination
    if (rules.type === 'all') {
      return this.getSubscribersAfterCursorForTenant(ownerId, limit, afterId);
    }
    
    // For tag-based segments, we need to filter in-memory
    // Fetch enough candidates to try to get 'limit' matching subscribers
    // but return ALL matching subscribers from the candidate batch to avoid re-processing
    const batchMultiplier = 5;
    let candidates = await this.getSubscribersAfterCursorForTenant(ownerId, limit * batchMultiplier, afterId);
    
    // Filter by segment rules - return ALL matches from this batch, not just 'limit'
    // This prevents duplicates when the cursor is set to the last processed subscriber's ID
    let filtered: Subscriber[] = [];
    if (rules.type === 'tags_any' && rules.tags && rules.tags.length > 0) {
      filtered = candidates.filter(sub => 
        sub.tags && sub.tags.length > 0 && sub.tags.some(tag => rules.tags!.includes(tag))
      );
    } else if (rules.type === 'tags_all' && rules.tags && rules.tags.length > 0) {
      filtered = candidates.filter(sub => 
        sub.tags && sub.tags.length > 0 && rules.tags!.every(tag => sub.tags.includes(tag))
      );
    }
    
    // Return all filtered subscribers (don't slice) to prevent re-processing
    // The worker will process them all and set cursor to the last one
    return filtered;
  }

  // Campaigns
  async getCampaigns(userId?: string): Promise<Campaign[]> {
    if (userId) {
      return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
    }
    return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  }

  async getCampaignsForTenant(ownerId: string): Promise<(Campaign & { creatorName: string })[]> {
    const tenantUsers = await db.select().from(users).where(
      or(eq(users.id, ownerId), eq(users.ownerId, ownerId))
    );
    const tenantUserIds = tenantUsers.map(u => u.id);
    
    if (tenantUserIds.length === 0) {
      return [];
    }

    const tenantCampaigns = await db
      .select({
        id: campaigns.id,
        userId: campaigns.userId,
        name: campaigns.name,
        subject: campaigns.subject,
        htmlContent: campaigns.htmlContent,
        status: campaigns.status,
        segmentId: campaigns.segmentId,
        senderIdentityId: campaigns.senderIdentityId,
        scheduledFor: campaigns.scheduledFor,
        sentAt: campaigns.sentAt,
        testEmailSentAt: campaigns.testEmailSentAt,
        createdAt: campaigns.createdAt,
        totalSent: campaigns.totalSent,
        totalDelivered: campaigns.totalDelivered,
        totalOpened: campaigns.totalOpened,
        totalClicked: campaigns.totalClicked,
        totalBounced: campaigns.totalBounced,
        totalComplaints: campaigns.totalComplaints,
        creatorName: users.name,
      })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.userId, users.id))
      .where(inArray(campaigns.userId, tenantUserIds))
      .orderBy(desc(campaigns.createdAt));

    return tenantCampaigns.map(c => ({
      ...c,
      creatorName: c.creatorName || 'Unknown',
    }));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    return result[0];
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const result = await db.insert(campaigns).values(campaign).returning();
    return result[0];
  }

  async updateCampaign(id: string, data: Partial<InsertCampaign & { sentAt?: Date }>): Promise<Campaign | undefined> {
    const result = await db.update(campaigns).set(data).where(eq(campaigns.id, id)).returning();
    return result[0];
  }

  async updateCampaignTestEmailSent(id: string): Promise<Campaign | undefined> {
    const result = await db.update(campaigns).set({ testEmailSentAt: new Date() }).where(eq(campaigns.id, id)).returning();
    return result[0];
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await db.delete(campaigns).where(eq(campaigns.id, id)).returning();
    return result.length > 0;
  }

  // Campaign Messages
  async getCampaignMessages(campaignId: string): Promise<CampaignMessage[]> {
    return db.select().from(campaignMessages).where(eq(campaignMessages.campaignId, campaignId));
  }

  async getCampaignMessage(id: string): Promise<CampaignMessage | undefined> {
    const result = await db.select().from(campaignMessages).where(eq(campaignMessages.id, id)).limit(1);
    return result[0];
  }

  async getCampaignMessageByToken(token: string): Promise<CampaignMessage | undefined> {
    const result = await db.select().from(campaignMessages).where(eq(campaignMessages.trackingToken, token)).limit(1);
    return result[0];
  }

  async getCampaignMessageBySesId(messageId: string): Promise<CampaignMessage | undefined> {
    const result = await db.select().from(campaignMessages).where(eq(campaignMessages.messageId, messageId)).limit(1);
    return result[0];
  }

  async createCampaignMessage(message: InsertCampaignMessage): Promise<CampaignMessage> {
    const result = await db.insert(campaignMessages).values(message).returning();
    return result[0];
  }

  async createCampaignMessagesBatch(messages: InsertCampaignMessage[]): Promise<CampaignMessage[]> {
    if (messages.length === 0) return [];
    const result = await db.insert(campaignMessages).values(messages).returning();
    return result;
  }

  async updateCampaignMessage(id: string, data: Partial<CampaignMessage>): Promise<CampaignMessage | undefined> {
    const result = await db.update(campaignMessages).set(data).where(eq(campaignMessages.id, id)).returning();
    return result[0];
  }

  // Email Events
  async createEmailEvent(event: InsertEmailEvent): Promise<EmailEvent> {
    const result = await db.insert(emailEvents).values(event).returning();
    return result[0];
  }

  async getEmailEvents(campaignMessageId: string): Promise<EmailEvent[]> {
    return db.select().from(emailEvents).where(eq(emailEvents.campaignMessageId, campaignMessageId));
  }

  // Campaign Jobs
  async createCampaignJob(job: InsertCampaignJob): Promise<CampaignJob> {
    const result = await db.insert(campaignJobs).values(job).returning();
    return result[0];
  }

  async getCampaignJob(id: string): Promise<CampaignJob | undefined> {
    const result = await db.select().from(campaignJobs).where(eq(campaignJobs.id, id)).limit(1);
    return result[0];
  }

  async getCampaignJobByCampaign(campaignId: string): Promise<CampaignJob | undefined> {
    const result = await db.select().from(campaignJobs)
      .where(eq(campaignJobs.campaignId, campaignId))
      .orderBy(desc(campaignJobs.createdAt))
      .limit(1);
    return result[0];
  }

  async updateCampaignJob(id: string, data: Partial<CampaignJob>): Promise<CampaignJob | undefined> {
    const result = await db.update(campaignJobs).set(data).where(eq(campaignJobs.id, id)).returning();
    return result[0];
  }

  async getActiveCampaignJobs(): Promise<CampaignJob[]> {
    return db.select().from(campaignJobs)
      .where(eq(campaignJobs.status, 'processing'))
      .orderBy(campaignJobs.createdAt);
  }

  // Test Email Logs
  async createTestEmailLog(log: InsertTestEmailLog): Promise<TestEmailLog> {
    const result = await db.insert(testEmailLogs).values(log).returning();
    return result[0];
  }

  async getTestEmailLogs(campaignId: string): Promise<(TestEmailLog & { senderUserName?: string })[]> {
    const logs = await db.select({
      log: testEmailLogs,
      userName: users.name,
    })
    .from(testEmailLogs)
    .leftJoin(users, eq(testEmailLogs.userId, users.id))
    .where(eq(testEmailLogs.campaignId, campaignId))
    .orderBy(desc(testEmailLogs.sentAt));
    
    return logs.map(row => ({
      ...row.log,
      senderUserName: row.userName || undefined,
    }));
  }

  // Paginated Subscribers with keyset pagination for O(n) performance
  async getSubscribersPaginated(userId: string, limit: number, offset: number): Promise<Subscriber[]> {
    return db.select().from(subscribers)
      .where(and(eq(subscribers.userId, userId), eq(subscribers.status, 'active')))
      .orderBy(subscribers.id)
      .limit(limit)
      .offset(offset);
  }

  // Keyset pagination for better performance with large datasets
  async getSubscribersAfterCursor(userId: string, limit: number, afterId?: string): Promise<Subscriber[]> {
    if (afterId) {
      return db.select().from(subscribers)
        .where(and(
          eq(subscribers.userId, userId), 
          eq(subscribers.status, 'active'),
          sql`${subscribers.id} > ${afterId}`
        ))
        .orderBy(subscribers.id)
        .limit(limit);
    }
    return db.select().from(subscribers)
      .where(and(eq(subscribers.userId, userId), eq(subscribers.status, 'active')))
      .orderBy(subscribers.id)
      .limit(limit);
  }

  async getSubscribersCount(userId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(subscribers)
      .where(and(eq(subscribers.userId, userId), eq(subscribers.status, 'active')));
    return result[0]?.count || 0;
  }

  async getSubscribersBySegmentPaginated(segmentId: string, userId: string, limit: number, offset: number): Promise<Subscriber[]> {
    const segment = await this.getSegment(segmentId);
    if (!segment || segment.userId !== userId) return [];
    
    let rules: SegmentRules;
    try {
      const rawRules = typeof segment.rules === 'string' 
        ? JSON.parse(segment.rules) 
        : segment.rules;
      rules = {
        type: rawRules?.type || 'all',
        tags: Array.isArray(rawRules?.tags) ? rawRules.tags : [],
      };
    } catch {
      rules = { type: 'all', tags: [] };
    }
    
    if (rules.type === 'all') {
      return this.getSubscribersPaginated(userId, limit, offset);
    }
    
    // For tag-based segments, we need to filter in-memory
    // TODO: Optimize with proper SQL for very large datasets
    const allMatching = await this.getSubscribersBySegment(segmentId, userId);
    return allMatching.slice(offset, offset + limit);
  }

  async getSubscribersBySegmentCount(segmentId: string, userId: string): Promise<number> {
    const segment = await this.getSegment(segmentId);
    if (!segment || segment.userId !== userId) return 0;
    
    let rules: SegmentRules;
    try {
      const rawRules = typeof segment.rules === 'string' 
        ? JSON.parse(segment.rules) 
        : segment.rules;
      rules = {
        type: rawRules?.type || 'all',
        tags: Array.isArray(rawRules?.tags) ? rawRules.tags : [],
      };
    } catch {
      rules = { type: 'all', tags: [] };
    }
    
    if (rules.type === 'all') {
      return this.getSubscribersCount(userId);
    }
    
    const allMatching = await this.getSubscribersBySegment(segmentId, userId);
    return allMatching.length;
  }

  // Keyset pagination for segments - O(n) performance for large datasets
  async getSubscribersBySegmentAfterCursor(segmentId: string, userId: string, limit: number, afterId?: string): Promise<Subscriber[]> {
    const segment = await this.getSegment(segmentId);
    if (!segment || segment.userId !== userId) return [];
    
    let rules: SegmentRules;
    try {
      const rawRules = typeof segment.rules === 'string' 
        ? JSON.parse(segment.rules) 
        : segment.rules;
      rules = {
        type: rawRules?.type || 'all',
        tags: Array.isArray(rawRules?.tags) ? rawRules.tags : [],
      };
    } catch {
      rules = { type: 'all', tags: [] };
    }
    
    // For "all" segment type, use direct keyset pagination
    if (rules.type === 'all') {
      return this.getSubscribersAfterCursor(userId, limit, afterId);
    }
    
    // For tag-based segments, we need to filter in-memory
    // Fetch a larger batch to ensure we get enough matches after filtering
    const batchMultiplier = 5;
    let candidates = await this.getSubscribersAfterCursor(userId, limit * batchMultiplier, afterId);
    
    // Filter by segment rules
    let filtered: Subscriber[] = [];
    if (rules.type === 'tags_any' && rules.tags && rules.tags.length > 0) {
      filtered = candidates.filter(sub => 
        sub.tags && sub.tags.length > 0 && sub.tags.some(tag => rules.tags!.includes(tag))
      );
    } else if (rules.type === 'tags_all' && rules.tags && rules.tags.length > 0) {
      filtered = candidates.filter(sub => 
        sub.tags && sub.tags.length > 0 && rules.tags!.every(tag => sub.tags.includes(tag))
      );
    }
    
    return filtered.slice(0, limit);
  }

  // Page-based pagination for UI with search support
  async getSubscribersPaged(userId: string, page: number, limit: number, search?: string): Promise<{
    subscribers: Subscriber[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;
    
    let whereCondition = eq(subscribers.userId, userId);
    
    if (search && search.trim()) {
      const searchTerm = `%${search.toLowerCase()}%`;
      whereCondition = and(
        eq(subscribers.userId, userId),
        sql`(LOWER(${subscribers.email}) LIKE ${searchTerm} OR LOWER(${subscribers.firstName}) LIKE ${searchTerm} OR LOWER(${subscribers.lastName}) LIKE ${searchTerm})`
      ) as any;
    }
    
    const [countResult, subscribersList] = await Promise.all([
      db.select({ count: count() }).from(subscribers).where(whereCondition),
      db.select().from(subscribers)
        .where(whereCondition)
        .orderBy(desc(subscribers.id))
        .limit(limit)
        .offset(offset)
    ]);
    
    const total = countResult[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    
    return {
      subscribers: subscribersList,
      total,
      page,
      limit,
      totalPages,
    };
  }

  // Tenant-aware paged subscribers
  async getSubscribersPagedForTenant(ownerId: string, page: number, limit: number, search?: string, filters?: { status?: string; tag?: string }): Promise<{
    subscribers: Subscriber[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const tenantUserIds = await this.getTenantUserIds(ownerId);
    if (tenantUserIds.length === 0) {
      return { subscribers: [], total: 0, page, limit, totalPages: 1 };
    }
    
    const offset = (page - 1) * limit;
    
    const conditions: any[] = [inArray(subscribers.userId, tenantUserIds)];
    
    if (search && search.trim()) {
      const searchTerm = `%${search.toLowerCase()}%`;
      conditions.push(
        sql`(LOWER(${subscribers.email}) LIKE ${searchTerm} OR LOWER(${subscribers.firstName}) LIKE ${searchTerm} OR LOWER(${subscribers.lastName}) LIKE ${searchTerm})`
      );
    }
    
    if (filters?.status && filters.status.trim()) {
      conditions.push(eq(subscribers.status, filters.status));
    }
    
    if (filters?.tag && filters.tag.trim()) {
      conditions.push(sql`${filters.tag} = ANY(${subscribers.tags})`);
    }
    
    const whereCondition = and(...conditions);
    
    const [countResult, subscribersList] = await Promise.all([
      db.select({ count: count() }).from(subscribers).where(whereCondition),
      db.select().from(subscribers)
        .where(whereCondition)
        .orderBy(desc(subscribers.id))
        .limit(limit)
        .offset(offset)
    ]);
    
    const total = countResult[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    
    return {
      subscribers: subscribersList,
      total,
      page,
      limit,
      totalPages,
    };
  }

  // Tenant-aware unique tags
  async getAllUniqueTagsForTenant(ownerId: string): Promise<string[]> {
    const allSubs = await this.getSubscribersForTenant(ownerId);
    const tagSet = new Set<string>();
    for (const sub of allSubs) {
      if (sub.tags) {
        sub.tags.forEach(tag => tagSet.add(tag));
      }
    }
    return Array.from(tagSet).sort();
  }

  // Audit Logs
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const result = await db.insert(auditLogs).values(log).returning();
    return result[0];
  }

  async getAuditLogs(userId?: string, filters?: {
    category?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    resourceType?: string;
    resourceId?: string;
  }): Promise<AuditLog[]> {
    let conditions: any[] = [];
    
    if (userId) {
      conditions.push(eq(auditLogs.userId, userId));
    }
    
    if (filters?.category) {
      conditions.push(eq(auditLogs.category, filters.category));
    }
    
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    
    if (filters?.status) {
      conditions.push(eq(auditLogs.status, filters.status));
    }
    
    if (filters?.resourceType) {
      conditions.push(eq(auditLogs.resourceType, filters.resourceType));
    }
    
    if (filters?.resourceId) {
      conditions.push(eq(auditLogs.resourceId, filters.resourceId));
    }
    
    if (filters?.startDate) {
      conditions.push(sql`${auditLogs.createdAt} >= ${filters.startDate}`);
    }
    
    if (filters?.endDate) {
      conditions.push(sql`${auditLogs.createdAt} <= ${filters.endDate}`);
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const result = await db.select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(1000);
    
    return result;
  }

  async getAuditLogsPaged(userId: string | undefined, page: number, limit: number, filters?: {
    category?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    search?: string;
  }): Promise<{
    logs: AuditLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;
    let conditions: any[] = [];
    
    if (userId) {
      conditions.push(eq(auditLogs.userId, userId));
    }
    
    if (filters?.category) {
      conditions.push(eq(auditLogs.category, filters.category));
    }
    
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    
    if (filters?.status) {
      conditions.push(eq(auditLogs.status, filters.status));
    }
    
    if (filters?.startDate) {
      conditions.push(sql`${auditLogs.createdAt} >= ${filters.startDate}`);
    }
    
    if (filters?.endDate) {
      conditions.push(sql`${auditLogs.createdAt} <= ${filters.endDate}`);
    }
    
    if (filters?.search && filters.search.trim()) {
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      conditions.push(
        sql`(LOWER(${auditLogs.description}) LIKE ${searchTerm} OR LOWER(${auditLogs.action}) LIKE ${searchTerm})`
      );
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult, logsList] = await Promise.all([
      db.select({ count: count() }).from(auditLogs).where(whereClause),
      db.select().from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset)
    ]);
    
    const total = countResult[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    
    return {
      logs: logsList,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getUsersForAlerts(ownerId: string): Promise<Omit<User, 'password'>[]> {
    const result = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isOwner: users.isOwner,
      ownerId: users.ownerId,
      createdAt: users.createdAt,
    }).from(users).where(
      sql`(${users.id} = ${ownerId} OR ${users.ownerId} = ${ownerId}) AND ${users.role} IN ('admin', 'associate')`
    );
    return result;
  }

  async getScheduledCampaignsDue(): Promise<Campaign[]> {
    const now = new Date();
    const result = await db.select().from(campaigns).where(
      and(
        eq(campaigns.status, 'scheduled'),
        sql`${campaigns.scheduledFor} <= ${now}`
      )
    );
    return result;
  }
}

export const storage = new DatabaseStorage();
