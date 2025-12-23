import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSubscriberSchema, insertSegmentSchema, insertCampaignSchema, AuditActions, AuditCategories, UserRoles, UserRole } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { hashPassword, comparePassword, requireAuth, requireAdmin, requireCampaignAccess, requireAssociateAccess, getSessionUserId, getSessionUserRole } from "./auth";
import { validateSESCredentials, validateSMTPCredentials, verifyEmailIdentity, sendEmail, generateTrackingToken, generateSecurePassword, sendTransactionalEmail, generateWelcomeEmailHtml } from "./ses";
import { startCampaignJob, pauseCampaignJob, isJobActive, sendCampaignAlerts } from "./campaignWorker";
import { generateEmailTemplate } from "./aiService";
import { audit, createAuditContext, auditAuth, auditSettings, auditSubscriber, auditSegment, auditCampaign, auditWebhook } from "./audit";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    const ctx = createAuditContext(req);
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string(),
      });
      const { email, password } = schema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user) {
        await auditAuth(AuditActions.USER_LOGIN_FAILED, `Login failed - user not found: ${email}`, { ...ctx, email, status: 'failure' });
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        await auditAuth(AuditActions.USER_LOGIN_FAILED, `Login failed - invalid password: ${email}`, { ...ctx, userId: user.id, email, status: 'failure' });
        return res.status(401).json({ error: "Invalid email or password" });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role as UserRole;
      await auditAuth(AuditActions.USER_LOGIN, `User logged in: ${email} (${user.role})`, { ...ctx, userId: user.id, email, status: 'success', metadata: { role: user.role } });
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch (error: any) {
      const validationError = fromError(error);
      await auditAuth(AuditActions.USER_LOGIN_FAILED, `Login failed: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const userId = getSessionUserId(req);
    const userRole = getSessionUserRole(req);
    const ctx = createAuditContext(req, userId);
    
    req.session.userId = undefined as any;
    req.session.userRole = undefined as any;
    
    req.session.destroy(async (err) => {
      if (err) {
        await auditAuth(AuditActions.USER_LOGOUT, `Logout failed`, { ...ctx, status: 'failure', errorMessage: err.message });
        return res.status(500).json({ error: "Failed to logout" });
      }
      await auditAuth(AuditActions.USER_LOGOUT, `User logged out`, { ...ctx, status: 'success', metadata: { role: userRole } });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, isOwner: user.isOwner });
  });

  // Password Change Route (authenticated users)
  app.patch("/api/auth/password", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    
    try {
      const schema = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      });
      const { currentPassword, newPassword } = schema.parse(req.body);

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const valid = await comparePassword(currentPassword, user.password);
      if (!valid) {
        await auditAuth(AuditActions.USER_PASSWORD_CHANGE, `Password change failed - invalid current password`, { 
          ...ctx, 
          status: 'failure',
          errorMessage: 'Invalid current password'
        });
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: hashedPassword });

      await auditAuth(AuditActions.USER_PASSWORD_CHANGE, `User changed their password`, { 
        ...ctx, 
        status: 'success'
      });
      
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error: any) {
      const validationError = fromError(error);
      await auditAuth(AuditActions.USER_PASSWORD_CHANGE, `Password change failed: ${validationError.toString()}`, { 
        ...ctx, 
        status: 'failure', 
        errorMessage: validationError.toString() 
      });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  // SES Credentials Routes (All authenticated users can view, owner can edit)
  app.get("/api/settings/ses", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Use owner's credentials for all users in the organization
      const effectiveOwnerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!effectiveOwnerId) {
        return res.json(null);
      }
      
      const creds = await storage.getSesCredentials(effectiveOwnerId);
      if (!creds) {
        return res.json(null);
      }
      res.json({
        id: creds.id,
        protocol: creds.protocol,
        accessKeyId: creds.accessKeyId ? creds.accessKeyId.substring(0, 8) + "********" : null,
        region: creds.region,
        smtpHost: creds.smtpHost,
        smtpPort: creds.smtpPort,
        smtpUser: creds.smtpUser ? creds.smtpUser.substring(0, 8) + "********" : null,
        fromEmail: creds.fromEmail,
        fromName: creds.fromName,
        isVerified: creds.isVerified,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch SES settings" });
    }
  });

  // API mode configuration (Owner only - SES is shared across all users)
  app.post("/api/settings/ses", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      // Only owner can configure SES credentials
      const isOwner = await storage.isUserOwner(userId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the owner can configure SES credentials" });
      }

      const schema = z.object({
        accessKeyId: z.string().min(1),
        secretAccessKey: z.string().min(1),
        region: z.string().min(1),
        fromEmail: z.string().email(),
        fromName: z.string().min(1),
      });
      const data = schema.parse(req.body);

      const validation = await validateSESCredentials({
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        region: data.region,
      });

      if (!validation.valid) {
        await auditSettings(AuditActions.SES_CREDENTIALS_VERIFY, `SES API credentials validation failed: ${validation.error}`, { ...ctx, status: 'failure', metadata: { region: data.region, fromEmail: data.fromEmail } });
        return res.status(400).json({ error: `Invalid AWS credentials: ${validation.error}` });
      }

      const emailVerification = await verifyEmailIdentity({
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        region: data.region,
      }, data.fromEmail);

      await storage.saveSesCredentials({
        userId,
        protocol: 'api',
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        region: data.region,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
      });

      if (emailVerification.verified) {
        await storage.updateSesCredentials(userId, { isVerified: true });
      }

      await auditSettings(AuditActions.SES_CREDENTIALS_CREATE, `SES API credentials configured for ${data.fromEmail}`, { ...ctx, status: 'success', metadata: { protocol: 'api', region: data.region, fromEmail: data.fromEmail, isVerified: emailVerification.verified } });
      res.json({
        success: true,
        isVerified: emailVerification.verified,
        verificationStatus: emailVerification.status,
      });
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSettings(AuditActions.SES_CREDENTIALS_CREATE, `SES credentials configuration failed: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  // SMTP mode configuration (Owner only - SES is shared across all users)
  app.post("/api/settings/ses/smtp", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      // Only owner can configure SES credentials
      const isOwner = await storage.isUserOwner(userId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the owner can configure SES credentials" });
      }

      const schema = z.object({
        smtpHost: z.string().min(1),
        smtpPort: z.number().int().positive(),
        smtpUser: z.string().min(1),
        smtpPassword: z.string().min(1),
        fromEmail: z.string().email(),
        fromName: z.string().min(1),
      });
      const data = schema.parse(req.body);

      const validation = await validateSMTPCredentials({
        host: data.smtpHost,
        port: data.smtpPort,
        user: data.smtpUser,
        password: data.smtpPassword,
      });

      if (!validation.valid) {
        await auditSettings(AuditActions.SES_CREDENTIALS_VERIFY, `SMTP credentials validation failed: ${validation.error}`, { ...ctx, status: 'failure', metadata: { smtpHost: data.smtpHost, fromEmail: data.fromEmail } });
        return res.status(400).json({ error: `Invalid SMTP credentials: ${validation.error}` });
      }

      await storage.saveSesCredentials({
        userId,
        protocol: 'smtp',
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpUser: data.smtpUser,
        smtpPassword: data.smtpPassword,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
      });

      await storage.updateSesCredentials(userId, { isVerified: true });

      await auditSettings(AuditActions.SES_CREDENTIALS_CREATE, `SMTP credentials configured for ${data.fromEmail}`, { ...ctx, status: 'success', metadata: { protocol: 'smtp', smtpHost: data.smtpHost, fromEmail: data.fromEmail } });
      res.json({
        success: true,
        isVerified: true,
      });
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSettings(AuditActions.SES_CREDENTIALS_CREATE, `SMTP credentials configuration failed: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  // Sender Identities Routes (Admin only)
  app.get("/api/settings/senders", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const ownerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!ownerId) {
        return res.json([]);
      }
      
      const senders = await storage.getSenderIdentities(ownerId);
      res.json(senders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sender identities" });
    }
  });

  app.post("/api/settings/senders", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const isOwner = await storage.isUserOwner(userId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the owner can add sender identities" });
      }

      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(1),
        isDefault: z.boolean().optional().default(false),
      });
      const data = schema.parse(req.body);

      // Check SES credentials are configured
      const sesCredentials = await storage.getSesCredentialsDecrypted(userId);
      if (!sesCredentials) {
        return res.status(400).json({ error: "Configure AWS SES credentials first" });
      }

      // Verify email in SES
      let isVerified = false;
      if (sesCredentials.protocol === 'api' && sesCredentials.decryptedSecretAccessKey) {
        const emailVerification = await verifyEmailIdentity({
          accessKeyId: sesCredentials.accessKeyId!,
          secretAccessKey: sesCredentials.decryptedSecretAccessKey,
          region: sesCredentials.region || 'us-east-1',
        }, data.email);
        isVerified = emailVerification.verified;
      } else if (sesCredentials.protocol === 'smtp') {
        // For SMTP, we trust the sender identity
        isVerified = true;
      }

      const sender = await storage.createSenderIdentity({
        ownerId: userId,
        email: data.email,
        name: data.name,
        isDefault: data.isDefault,
      });

      // Update verification status
      if (isVerified) {
        await storage.updateSenderIdentity(sender.id, userId, { isVerified: true });
      }

      // If this is marked as default, set it as default
      if (data.isDefault) {
        await storage.setDefaultSenderIdentity(sender.id, userId);
      }

      const updatedSender = await storage.getSenderIdentityForTenant(sender.id, userId);
      await auditSettings(AuditActions.SES_CREDENTIALS_CREATE, `Added sender identity: ${data.email}`, { ...ctx, status: 'success', metadata: { email: data.email, name: data.name, isVerified } });
      res.status(201).json({ ...updatedSender, isVerified });
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSettings(AuditActions.SES_CREDENTIALS_CREATE, `Failed to add sender identity: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.put("/api/settings/senders/:id", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const isOwner = await storage.isUserOwner(userId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the owner can update sender identities" });
      }

      // Use tenant-scoped query to ensure ownership
      const sender = await storage.getSenderIdentityForTenant(req.params.id, userId);
      if (!sender) {
        return res.status(404).json({ error: "Sender identity not found" });
      }

      const schema = z.object({
        email: z.string().email().optional(),
        name: z.string().min(1).optional(),
        isDefault: z.boolean().optional(),
      });
      const data = schema.parse(req.body);

      // If setting as default, update the default status
      if (data.isDefault === true) {
        await storage.setDefaultSenderIdentity(req.params.id, userId);
      }

      // Re-verify if email changed
      let isVerified = sender.isVerified;
      if (data.email && data.email !== sender.email) {
        const sesCredentials = await storage.getSesCredentialsDecrypted(userId);
        if (sesCredentials?.protocol === 'api' && sesCredentials.decryptedSecretAccessKey) {
          const emailVerification = await verifyEmailIdentity({
            accessKeyId: sesCredentials.accessKeyId!,
            secretAccessKey: sesCredentials.decryptedSecretAccessKey,
            region: sesCredentials.region || 'us-east-1',
          }, data.email);
          isVerified = emailVerification.verified;
        } else if (sesCredentials?.protocol === 'smtp') {
          isVerified = true;
        }
      }

      const updated = await storage.updateSenderIdentity(req.params.id, userId, { ...data, isVerified });
      await auditSettings(AuditActions.SES_CREDENTIALS_UPDATE, `Updated sender identity: ${updated?.email || sender.email}`, { ...ctx, status: 'success', metadata: { senderId: req.params.id } });
      res.json(updated);
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSettings(AuditActions.SES_CREDENTIALS_UPDATE, `Failed to update sender identity: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.delete("/api/settings/senders/:id", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const isOwner = await storage.isUserOwner(userId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the owner can delete sender identities" });
      }

      // Use tenant-scoped query to ensure ownership
      const sender = await storage.getSenderIdentityForTenant(req.params.id, userId);
      if (!sender) {
        return res.status(404).json({ error: "Sender identity not found" });
      }

      await storage.deleteSenderIdentity(req.params.id, userId);
      await auditSettings(AuditActions.SES_CREDENTIALS_DELETE, `Deleted sender identity: ${sender.email}`, { ...ctx, status: 'success', metadata: { email: sender.email } });
      res.json({ success: true });
    } catch (error: any) {
      await auditSettings(AuditActions.SES_CREDENTIALS_DELETE, `Failed to delete sender identity: ${error.message}`, { ...ctx, status: 'failure', errorMessage: error.message });
      res.status(500).json({ error: "Failed to delete sender identity" });
    }
  });

  app.patch("/api/settings/senders/:id/deactivate", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const isOwner = await storage.isUserOwner(userId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the owner can deactivate sender identities" });
      }

      const sender = await storage.getSenderIdentityForTenant(req.params.id, userId);
      if (!sender) {
        return res.status(404).json({ error: "Sender identity not found" });
      }

      const updated = await storage.deactivateSenderIdentity(req.params.id, userId);
      await auditSettings(AuditActions.SES_CREDENTIALS_UPDATE, `Deactivated sender identity: ${sender.email}`, { ...ctx, status: 'success', metadata: { email: sender.email } });
      res.json(updated);
    } catch (error: any) {
      await auditSettings(AuditActions.SES_CREDENTIALS_UPDATE, `Failed to deactivate sender identity: ${error.message}`, { ...ctx, status: 'failure', errorMessage: error.message });
      res.status(500).json({ error: "Failed to deactivate sender identity" });
    }
  });

  app.patch("/api/settings/senders/:id/activate", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const isOwner = await storage.isUserOwner(userId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only the owner can activate sender identities" });
      }

      const sender = await storage.getSenderIdentityForTenant(req.params.id, userId);
      if (!sender) {
        return res.status(404).json({ error: "Sender identity not found" });
      }

      const updated = await storage.activateSenderIdentity(req.params.id, userId);
      await auditSettings(AuditActions.SES_CREDENTIALS_UPDATE, `Activated sender identity: ${sender.email}`, { ...ctx, status: 'success', metadata: { email: sender.email } });
      res.json(updated);
    } catch (error: any) {
      await auditSettings(AuditActions.SES_CREDENTIALS_UPDATE, `Failed to activate sender identity: ${error.message}`, { ...ctx, status: 'failure', errorMessage: error.message });
      res.status(500).json({ error: "Failed to activate sender identity" });
    }
  });

  // Subscribers Routes (Admin and Associate)
  app.get("/api/subscribers", requireAssociateAccess, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || '';
      const tag = (req.query.tag as string) || '';
      
      const result = await storage.getSubscribersPagedForTenant(ownerId, page, limit, search, { status, tag });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscribers" });
    }
  });

  app.get("/api/subscribers/:id", requireAssociateAccess, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      // Verify subscriber belongs to tenant
      const tenantUserIds = await storage.getTenantUserIds(ownerId);
      const subscriber = await storage.getSubscriber(req.params.id);
      if (!subscriber || !tenantUserIds.includes(subscriber.userId!)) {
        return res.status(404).json({ error: "Subscriber not found" });
      }
      res.json(subscriber);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscriber" });
    }
  });

  app.post("/api/subscribers", requireAssociateAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Store subscriber with current user's ID so we can track who created it
      const validated = insertSubscriberSchema.parse({ ...req.body, userId });
      
      // Check for existing subscriber with same email (case-insensitive)
      const existing = await storage.getSubscriberByEmail(validated.email, userId);
      if (existing) {
        // Merge tags instead of creating duplicate
        const existingTags = existing.tags || [];
        const newTags = validated.tags || [];
        const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
        
        const updated = await storage.updateSubscriber(existing.id, {
          tags: mergedTags,
          firstName: validated.firstName || existing.firstName,
          lastName: validated.lastName || existing.lastName,
        });
        await auditSubscriber(AuditActions.SUBSCRIBER_UPDATE, `Updated existing subscriber: ${existing.email} (merged tags)`, { ...ctx, subscriberId: existing.id, metadata: { email: existing.email, mergedTags } });
        return res.status(200).json({ ...updated, merged: true });
      }
      
      const subscriber = await storage.createSubscriber(validated);
      await auditSubscriber(AuditActions.SUBSCRIBER_CREATE, `Created subscriber: ${subscriber.email}`, { ...ctx, subscriberId: subscriber.id, metadata: { email: subscriber.email, tags: subscriber.tags } });
      res.status(201).json(subscriber);
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSubscriber(AuditActions.SUBSCRIBER_CREATE, `Failed to create subscriber: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.post("/api/subscribers/bulk", requireAssociateAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const { subscribers: subscriberList } = req.body;
      if (!Array.isArray(subscriberList)) {
        return res.status(400).json({ error: "Expected array of subscribers" });
      }

      // Store subscribers with current user's ID
      const validated = subscriberList.map(s => insertSubscriberSchema.parse({ ...s, userId }));
      const result = await storage.bulkCreateSubscribers(validated);
      await auditSubscriber(AuditActions.SUBSCRIBER_IMPORT, `Imported ${result.created.length + result.updated.length} subscribers (${result.created.length} new, ${result.updated.length} updated)`, { ...ctx, metadata: { total: result.created.length + result.updated.length, created: result.created.length, updated: result.updated.length } });
      res.status(201).json({ 
        count: result.created.length + result.updated.length,
        created: result.created.length,
        updated: result.updated.length,
        subscribers: [...result.created, ...result.updated]
      });
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSubscriber(AuditActions.SUBSCRIBER_IMPORT, `Failed to import subscribers: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.patch("/api/subscribers/:id", requireAssociateAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      // Verify subscriber belongs to tenant
      const tenantUserIds = await storage.getTenantUserIds(ownerId);
      const existingSubscriber = await storage.getSubscriber(req.params.id);
      if (!existingSubscriber || !tenantUserIds.includes(existingSubscriber.userId!)) {
        return res.status(404).json({ error: "Subscriber not found" });
      }
      
      const validated = insertSubscriberSchema.partial().parse(req.body);
      const subscriber = await storage.updateSubscriber(req.params.id, validated);
      if (!subscriber) {
        return res.status(404).json({ error: "Subscriber not found" });
      }
      await auditSubscriber(AuditActions.SUBSCRIBER_UPDATE, `Updated subscriber: ${subscriber.email}`, { ...ctx, subscriberId: subscriber.id, metadata: { changes: Object.keys(validated) } });
      res.json(subscriber);
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSubscriber(AuditActions.SUBSCRIBER_UPDATE, `Failed to update subscriber: ${validationError.toString()}`, { ...ctx, subscriberId: req.params.id, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.delete("/api/subscribers/:id", requireAssociateAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!ownerId) {
        return res.status(403).json({ error: "User is not associated with any organization" });
      }
      
      // Verify subscriber belongs to tenant
      const tenantUserIds = await storage.getTenantUserIds(ownerId);
      const subscriber = await storage.getSubscriber(req.params.id);
      if (!subscriber || !tenantUserIds.includes(subscriber.userId!)) {
        return res.status(404).json({ error: "Subscriber not found" });
      }
      
      const deleted = await storage.deleteSubscriber(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Subscriber not found" });
      }
      await auditSubscriber(AuditActions.SUBSCRIBER_DELETE, `Deleted subscriber: ${subscriber?.email || req.params.id}`, { ...ctx, subscriberId: req.params.id, metadata: { email: subscriber?.email } });
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete subscriber:", error);
      res.status(500).json({ error: "Failed to delete subscriber" });
    }
  });

  // Tags Route - get all unique tags from subscribers (Admin and Associate)
  app.get("/api/tags", requireAssociateAccess, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      const tags = await storage.getAllUniqueTagsForTenant(ownerId);
      res.json(tags);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // Delete subscribers by tag (Admin only)
  app.delete("/api/subscribers/by-tag/:tag", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    const tag = decodeURIComponent(req.params.tag);
    
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!ownerId) {
        return res.status(403).json({ error: "User is not associated with any organization" });
      }
      
      const deletedCount = await storage.deleteSubscribersByTagForTenant(tag, ownerId);
      await auditSubscriber(AuditActions.SUBSCRIBER_DELETE, `Deleted ${deletedCount} subscribers with tag: ${tag}`, { ...ctx, metadata: { tag, deletedCount } });
      res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} subscribers with tag "${tag}"` });
    } catch (error) {
      console.error("Failed to delete subscribers by tag:", error);
      res.status(500).json({ error: "Failed to delete subscribers" });
    }
  });

  // Remove a tag from all subscribers (Admin only)
  app.delete("/api/tags/:tag", requireAdmin, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    const tag = decodeURIComponent(req.params.tag);
    
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!ownerId) {
        return res.status(403).json({ error: "User is not associated with any organization" });
      }
      
      const updatedCount = await storage.removeTagFromAllSubscribersForTenant(tag, ownerId);
      await auditSubscriber(AuditActions.SUBSCRIBER_UPDATE, `Removed tag "${tag}" from ${updatedCount} subscribers`, { ...ctx, metadata: { tag, updatedCount } });
      res.json({ success: true, updatedCount, message: `Removed tag "${tag}" from ${updatedCount} subscribers` });
    } catch (error) {
      console.error("Failed to remove tag:", error);
      res.status(500).json({ error: "Failed to remove tag" });
    }
  });

  // Segments Routes (Admin and Associate)
  app.get("/api/segments", requireAssociateAccess, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      // Fetch all segments in the tenant
      const segs = await storage.getSegmentsForTenant(ownerId);
      const segmentsWithCount = await Promise.all(
        segs.map(async (segment) => ({
          ...segment,
          count: await storage.getSubscribersBySegmentCountForTenant(segment.id, ownerId),
        }))
      );
      res.json(segmentsWithCount);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch segments" });
    }
  });

  app.get("/api/segments/:id", requireAssociateAccess, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      // Verify segment belongs to tenant
      const tenantUserIds = await storage.getTenantUserIds(ownerId);
      const segment = await storage.getSegment(req.params.id);
      if (!segment || !tenantUserIds.includes(segment.userId!)) {
        return res.status(404).json({ error: "Segment not found" });
      }
      const count = await storage.getSubscribersBySegmentCountForTenant(segment.id, ownerId);
      res.json({ ...segment, count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch segment" });
    }
  });

  app.post("/api/segments", requireAssociateAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Store segment with current user's ID (not ownerId) so we can track who created it
      const validated = insertSegmentSchema.parse({ ...req.body, userId });
      const segment = await storage.createSegment(validated);
      await auditSegment(AuditActions.SEGMENT_CREATE, `Created segment: ${segment.name}`, { ...ctx, segmentId: segment.id, metadata: { name: segment.name, rules: segment.rules } });
      res.status(201).json(segment);
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSegment(AuditActions.SEGMENT_CREATE, `Failed to create segment: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.patch("/api/segments/:id", requireAssociateAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      // Verify segment belongs to tenant
      const tenantUserIds = await storage.getTenantUserIds(ownerId);
      const existingSegment = await storage.getSegment(req.params.id);
      if (!existingSegment || !tenantUserIds.includes(existingSegment.userId!)) {
        return res.status(404).json({ error: "Segment not found" });
      }
      
      const validated = insertSegmentSchema.partial().parse(req.body);
      const segment = await storage.updateSegment(req.params.id, validated);
      if (!segment) {
        return res.status(404).json({ error: "Segment not found" });
      }
      await auditSegment(AuditActions.SEGMENT_UPDATE, `Updated segment: ${segment.name}`, { ...ctx, segmentId: segment.id, metadata: { changes: Object.keys(validated) } });
      res.json(segment);
    } catch (error: any) {
      const validationError = fromError(error);
      await auditSegment(AuditActions.SEGMENT_UPDATE, `Failed to update segment: ${validationError.toString()}`, { ...ctx, segmentId: req.params.id, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.delete("/api/segments/:id", requireAssociateAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.ownerId || currentUser.id;
      
      // Verify segment belongs to tenant
      const tenantUserIds = await storage.getTenantUserIds(ownerId);
      const segment = await storage.getSegment(req.params.id);
      if (!segment || !tenantUserIds.includes(segment.userId!)) {
        return res.status(404).json({ error: "Segment not found" });
      }
      
      const deleted = await storage.deleteSegment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Segment not found" });
      }
      await auditSegment(AuditActions.SEGMENT_DELETE, `Deleted segment: ${segment?.name || req.params.id}`, { ...ctx, segmentId: req.params.id, metadata: { name: segment?.name } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete segment" });
    }
  });

  // Campaigns Routes (View: All roles, Create/Update/Delete/Send: Admin & Creator)
  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const effectiveOwnerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!effectiveOwnerId) {
        return res.status(403).json({ error: "User is not associated with any organization" });
      }
      
      const camps = await storage.getCampaignsForTenant(effectiveOwnerId);
      res.json(camps);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Include job timing data for analytics
      const job = await storage.getCampaignJobByCampaign(req.params.id);
      const campaignWithTiming = {
        ...campaign,
        jobStartedAt: job?.startedAt || null,
        jobFinishedAt: job?.finishedAt || null,
      };
      
      res.json(campaignWithTiming);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  // Get test email logs for a campaign
  app.get("/api/campaigns/:id/test-logs", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      const logs = await storage.getTestEmailLogs(req.params.id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch test email logs" });
    }
  });

  app.post("/api/campaigns", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const validated = insertCampaignSchema.parse({ ...req.body, userId });
      const campaign = await storage.createCampaign(validated);
      await auditCampaign(AuditActions.CAMPAIGN_CREATE, `Created campaign: ${campaign.name}`, { ...ctx, campaignId: campaign.id, metadata: { name: campaign.name, subject: campaign.subject } });
      res.status(201).json(campaign);
    } catch (error: any) {
      const validationError = fromError(error);
      await auditCampaign(AuditActions.CAMPAIGN_CREATE, `Failed to create campaign: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.patch("/api/campaigns/:id", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Only admin or creator can edit
      const isAdmin = currentUser.role === 'admin';
      const isCreator = campaign.userId === userId;
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: "Only the campaign creator or an admin can edit this campaign" });
      }
      
      const validated = insertCampaignSchema.partial().parse(req.body);
      const updatedCampaign = await storage.updateCampaign(req.params.id, validated);
      if (!updatedCampaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      await auditCampaign(AuditActions.CAMPAIGN_UPDATE, `Updated campaign: ${updatedCampaign.name}`, { ...ctx, campaignId: updatedCampaign.id, metadata: { changes: Object.keys(validated) } });
      res.json(updatedCampaign);
    } catch (error: any) {
      const validationError = fromError(error);
      await auditCampaign(AuditActions.CAMPAIGN_UPDATE, `Failed to update campaign: ${validationError.toString()}`, { ...ctx, campaignId: req.params.id, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.delete("/api/campaigns/:id", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      // Prevent deletion of campaigns that have been sent or are in progress
      const nonDeletableStatuses = ['sending', 'completed', 'scheduled', 'paused'];
      if (nonDeletableStatuses.includes(campaign.status)) {
        return res.status(400).json({ 
          error: `Cannot delete a campaign that is ${campaign.status}. Only draft or failed campaigns can be deleted.` 
        });
      }
      
      // Only admin or creator can delete
      const isAdmin = currentUser.role === 'admin';
      const isCreator = campaign.userId === userId;
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: "Only the campaign creator or an admin can delete this campaign" });
      }
      
      const deleted = await storage.deleteCampaign(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      await auditCampaign(AuditActions.CAMPAIGN_DELETE, `Deleted campaign: ${campaign?.name || req.params.id}`, { ...ctx, campaignId: req.params.id, metadata: { name: campaign?.name } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // Send Test Email (Admin & Associate)
  app.post("/api/campaigns/test", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    try {
      const schema = z.object({
        subject: z.string().min(1),
        htmlContent: z.string(),
        testEmail: z.string().email(),
        senderIdentityId: z.string().min(1, "Please select a sender email address"),
        campaignId: z.string().optional(),
      });
      const { subject, htmlContent, testEmail, senderIdentityId, campaignId } = schema.parse(req.body);

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      const ownerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!ownerId) {
        return res.status(400).json({ error: "User is not associated with any organization" });
      }

      const creds = await storage.getSesCredentialsDecrypted(userId);
      if (!creds) {
        return res.status(400).json({ error: "Please configure AWS SES credentials in Settings first" });
      }

      if (!creds.isVerified) {
        return res.status(400).json({ error: "Your sender email is not verified in AWS SES" });
      }

      // Get sender identity (required)
      const senderIdentity = await storage.getSenderIdentityForTenant(senderIdentityId, ownerId);
      if (!senderIdentity) {
        return res.status(400).json({ error: "Selected sender email address not found" });
      }
      if (!senderIdentity.isVerified) {
        return res.status(400).json({ error: "Selected sender email is not verified in AWS SES" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const trackingToken = generateTrackingToken();

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

      const result = await sendEmail(
        protocol,
        config,
        {
          to: testEmail,
          subject: `[TEST] ${subject}`,
          htmlBody: htmlContent || `<p>${subject}</p>`,
          fromEmail: senderIdentity.email,
          fromName: senderIdentity.name,
          trackingToken,
          baseUrl,
        }
      );

      if (result.success) {
        if (campaignId) {
          await storage.updateCampaignTestEmailSent(campaignId);
          // Log the test email
          await storage.createTestEmailLog({
            campaignId,
            userId,
            recipientEmail: testEmail,
            senderEmail: senderIdentity.email,
            senderName: senderIdentity.name || undefined,
            subject: `[TEST] ${subject}`,
            status: 'sent',
            messageId: result.messageId,
          });
        }
        await auditCampaign(AuditActions.CAMPAIGN_TEST_SEND, `Sent test email to ${testEmail}`, { ...ctx, campaignId, metadata: { testEmail, subject } });
        res.json({ 
          success: true, 
          message: `Test email sent successfully to ${testEmail}` 
        });
      } else {
        if (campaignId) {
          // Log failed test email
          await storage.createTestEmailLog({
            campaignId,
            userId,
            recipientEmail: testEmail,
            senderEmail: senderIdentity.email,
            senderName: senderIdentity.name || undefined,
            subject: `[TEST] ${subject}`,
            status: 'failed',
            errorMessage: result.error || "Unknown error",
          });
        }
        await auditCampaign(AuditActions.CAMPAIGN_TEST_SEND, `Failed to send test email to ${testEmail}: ${result.error}`, { ...ctx, status: 'failure', metadata: { testEmail, subject }, errorMessage: result.error });
        res.status(500).json({ 
          error: result.error || "Failed to send test email" 
        });
      }
    } catch (error: any) {
      console.error("Send test email error:", error);
      const validationError = fromError(error);
      await auditCampaign(AuditActions.CAMPAIGN_TEST_SEND, `Failed to send test email: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  // Send Campaign (creates a background job for large campaigns) - Admin & Associate
  app.post("/api/campaigns/:id/send", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    const campaignId = req.params.id;
    try {
      const { batchSize = 50, delayBetweenBatches = 1000 } = req.body;

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only admin or creator can send
      const isAdmin = currentUser.role === 'admin';
      const isCreator = campaign.userId === userId;
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: "Only the campaign creator or an admin can send this campaign" });
      }

      if (campaign.status !== 'draft') {
        return res.status(400).json({ error: "Campaign can only be sent from draft status" });
      }

      if (!campaign.testEmailSentAt) {
        return res.status(400).json({ error: "Please send a test email before launching this campaign" });
      }

      if (!campaign.segmentId) {
        return res.status(400).json({ error: "Please select a segment before sending the campaign" });
      }

      if (!campaign.senderIdentityId) {
        return res.status(400).json({ error: "Please select a sender email address before sending the campaign" });
      }

      const segment = await storage.getSegment(campaign.segmentId);
      if (!segment) {
        return res.status(400).json({ error: "Selected segment not found" });
      }

      // Use ownerId for tenant-based access
      const ownerId = currentUser.ownerId || currentUser.id;

      // Validate sender identity exists and is verified
      const senderIdentity = await storage.getSenderIdentityForTenant(campaign.senderIdentityId, ownerId);
      if (!senderIdentity) {
        return res.status(400).json({ error: "Selected sender email address not found" });
      }
      if (!senderIdentity.isVerified) {
        return res.status(400).json({ error: "Selected sender email is not verified in AWS SES" });
      }

      const creds = await storage.getSesCredentialsDecrypted(userId);
      if (!creds) {
        return res.status(400).json({ error: "Please configure AWS SES credentials in Settings first" });
      }

      if (!creds.isVerified) {
        return res.status(400).json({ error: "Your sender email is not verified in AWS SES" });
      }

      const totalRecipients = await storage.getSubscribersBySegmentCountForTenant(campaign.segmentId, ownerId);

      if (totalRecipients === 0) {
        return res.status(400).json({ error: "No subscribers in this segment to send to" });
      }

      const totalBatches = Math.ceil(totalRecipients / batchSize);

      const job = await storage.createCampaignJob({
        campaignId,
        userId,
        status: 'pending',
        totalRecipients,
        totalBatches,
        batchSize,
        delayBetweenBatches,
      });

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      startCampaignJob(job.id, campaignId, userId, baseUrl, ownerId);

      await auditCampaign(AuditActions.CAMPAIGN_SEND, `Started sending campaign "${campaign.name}" to ${totalRecipients.toLocaleString()} recipients`, { ...ctx, campaignId, metadata: { totalRecipients, totalBatches, batchSize, segmentId: campaign.segmentId, jobId: job.id } });
      res.json({
        success: true,
        jobId: job.id,
        totalRecipients,
        totalBatches,
        batchSize,
        message: `Campaign queued for sending. Processing ${totalRecipients.toLocaleString()} recipients in ${totalBatches} batches.`,
      });
    } catch (error: any) {
      console.error("Send campaign error:", error);
      await auditCampaign(AuditActions.CAMPAIGN_SEND, `Failed to send campaign: ${error.message}`, { ...ctx, campaignId, status: 'failure', errorMessage: error.message });
      res.status(500).json({ error: error.message || "Failed to send campaign" });
    }
  });

  // Get campaign recipients/messages
  app.get("/api/campaigns/:id/recipients", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const campaignId = req.params.id;

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Allow access if user is in the same tenant as the campaign creator
      const currentUser = await storage.getUser(userId);
      const campaignCreator = await storage.getUser(campaign.userId);
      if (!currentUser || !campaignCreator) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const currentUserOwnerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      const campaignOwnerID = campaignCreator.isOwner ? campaignCreator.id : campaignCreator.ownerId;
      
      if (currentUserOwnerId !== campaignOwnerID) {
        return res.status(403).json({ error: "Access denied" });
      }

      const messages = await storage.getCampaignMessages(campaignId);
      
      const recipients = messages.map(msg => {
        // Compute status based on timestamps (most significant action first)
        let computedStatus = msg.status;
        if (msg.bouncedAt) {
          computedStatus = 'bounced';
        } else if (msg.clickedAt) {
          computedStatus = 'clicked';
        } else if (msg.openedAt) {
          computedStatus = 'opened';
        } else if (msg.deliveredAt) {
          computedStatus = 'delivered';
        } else if (msg.sentAt) {
          computedStatus = 'sent';
        }
        
        return {
          id: msg.id,
          email: msg.email,
          status: computedStatus,
          sentAt: msg.sentAt,
          deliveredAt: msg.deliveredAt,
          openedAt: msg.openedAt,
          clickedAt: msg.clickedAt,
          bouncedAt: msg.bouncedAt,
        };
      });

      res.json({ recipients, total: recipients.length });
    } catch (error: any) {
      console.error("Get campaign recipients error:", error);
      res.status(500).json({ error: error.message || "Failed to get campaign recipients" });
    }
  });

  // Get campaign job status
  app.get("/api/campaigns/:id/job", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const campaignId = req.params.id;

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Allow access if user is in the same tenant as the campaign creator
      const currentUser = await storage.getUser(userId);
      const campaignCreator = await storage.getUser(campaign.userId);
      if (!currentUser || !campaignCreator) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const currentUserOwnerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      const campaignOwnerID = campaignCreator.isOwner ? campaignCreator.id : campaignCreator.ownerId;
      
      if (currentUserOwnerId !== campaignOwnerID) {
        return res.status(403).json({ error: "Access denied" });
      }

      const job = await storage.getCampaignJobByCampaign(campaignId);
      if (!job) {
        return res.json({ hasJob: false });
      }

      const progress = job.totalRecipients > 0 
        ? Math.round((job.processedCount / job.totalRecipients) * 100)
        : 0;

      res.json({
        hasJob: true,
        jobId: job.id,
        status: job.status,
        progress,
        totalRecipients: job.totalRecipients,
        processedCount: job.processedCount,
        sentCount: job.sentCount,
        failedCount: job.failedCount,
        currentBatch: job.currentBatch,
        totalBatches: job.totalBatches,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        lastError: job.lastError,
        isActive: isJobActive(job.id),
      });
    } catch (error: any) {
      console.error("Get job status error:", error);
      res.status(500).json({ error: error.message || "Failed to get job status" });
    }
  });

  // Pause campaign job
  app.post("/api/campaigns/:id/pause", requireAuth, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    const campaignId = req.params.id;
    try {
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (campaign.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const job = await storage.getCampaignJobByCampaign(campaignId);
      if (!job) {
        return res.status(404).json({ error: "No active job found for this campaign" });
      }

      const paused = pauseCampaignJob(job.id);
      if (paused) {
        await auditCampaign(AuditActions.CAMPAIGN_PAUSE, `Paused campaign "${campaign.name}"`, { ...ctx, campaignId, metadata: { jobId: job.id, processedCount: job.processedCount, totalRecipients: job.totalRecipients } });
        res.json({ success: true, message: "Campaign paused" });
      } else {
        res.json({ success: false, message: "Job is not currently active" });
      }
    } catch (error: any) {
      console.error("Pause campaign error:", error);
      res.status(500).json({ error: error.message || "Failed to pause campaign" });
    }
  });

  // Tracking Routes (public)
  app.get("/t/open/:token", async (req, res) => {
    try {
      const message = await storage.getCampaignMessageByToken(req.params.token);
      if (message && !message.openedAt) {
        await storage.updateCampaignMessage(message.id, { openedAt: new Date() });
        await storage.createEmailEvent({
          campaignMessageId: message.id,
          eventType: 'open',
          eventData: { userAgent: req.get('user-agent') },
        });

        const campaign = await storage.getCampaign(message.campaignId);
        if (campaign) {
          await storage.updateCampaign(message.campaignId, {
            totalOpened: campaign.totalOpened + 1,
          });
        }
      }
    } catch (error) {
      console.error("Tracking error:", error);
    }
    
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(pixel);
  });

  app.get("/t/click/:token", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).send("Missing URL");
      }

      const message = await storage.getCampaignMessageByToken(req.params.token);
      if (message && !message.clickedAt) {
        await storage.updateCampaignMessage(message.id, { clickedAt: new Date() });
        await storage.createEmailEvent({
          campaignMessageId: message.id,
          eventType: 'click',
          eventData: { url: decodeURIComponent(url), userAgent: req.get('user-agent') },
        });

        const campaign = await storage.getCampaign(message.campaignId);
        if (campaign) {
          await storage.updateCampaign(message.campaignId, {
            totalClicked: campaign.totalClicked + 1,
          });
        }
      }

      res.redirect(decodeURIComponent(url));
    } catch (error) {
      console.error("Click tracking error:", error);
      res.status(500).send("Error");
    }
  });

  // SES Webhook for bounces/complaints (publicly accessible for AWS SNS)
  app.post("/api/webhooks/ses", async (req, res) => {
    try {
      // AWS SNS sends as text/plain, so we need to parse the string body
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e) {
          console.error("[SES Webhook] Failed to parse string body:", e);
          return res.status(200).send("OK");
        }
      }
      console.log("[SES Webhook] Received:", JSON.stringify(body).substring(0, 500));
      
      // Handle SNS subscription confirmation
      if (body.Type === 'SubscriptionConfirmation') {
        console.log("[SES Webhook] Subscription confirmation received");
        console.log("[SES Webhook] SubscribeURL:", body.SubscribeURL);
        
        // Auto-confirm the subscription by making a GET request to the SubscribeURL
        if (body.SubscribeURL) {
          try {
            const confirmRes = await fetch(body.SubscribeURL);
            console.log("[SES Webhook] Subscription confirmed:", confirmRes.status);
          } catch (err) {
            console.error("[SES Webhook] Failed to confirm subscription:", err);
          }
        }
        return res.status(200).send("OK");
      }

      if (body.Type === 'Notification') {
        let message;
        try {
          message = typeof body.Message === 'string' ? JSON.parse(body.Message) : body.Message;
        } catch (e) {
          console.error("[SES Webhook] Failed to parse message:", e);
          return res.status(200).send("OK");
        }
        
        console.log("[SES Webhook] Notification type:", message.notificationType);
        
        if (message.notificationType === 'Bounce') {
          const bounceType = message.bounce?.bounceType || 'unknown';
          const bounced = message.bounce?.bouncedRecipients || [];
          const sesMessageId = message.mail?.messageId;
          console.log(`[SES Webhook] Processing ${bounced.length} bounced recipients (${bounceType}), messageId: ${sesMessageId}`);
          
          // First, find the campaign message by SES message ID for proper scoping
          if (sesMessageId) {
            const campaignMsg = await storage.getCampaignMessageBySesId(sesMessageId);
            if (campaignMsg) {
              // Update the campaign message status
              await storage.updateCampaignMessage(campaignMsg.id, { 
                status: 'bounced',
                bouncedAt: new Date() 
              });
              
              // Create email event
              await storage.createEmailEvent({
                campaignMessageId: campaignMsg.id,
                eventType: 'bounce',
                eventData: { bounceType, recipients: bounced.map((r: any) => r.emailAddress) },
              });
              
              // Update campaign bounce count
              const campaign = await storage.getCampaign(campaignMsg.campaignId);
              if (campaign) {
                await storage.updateCampaign(campaign.id, { 
                  totalBounced: campaign.totalBounced + 1 
                });
                
                // Update subscriber status (scoped to the campaign's user)
                if (campaign.userId) {
                  for (const recipient of bounced) {
                    const email = recipient.emailAddress?.toLowerCase();
                    if (!email) continue;
                    
                    const sub = await storage.getSubscriberByEmail(email, campaign.userId);
                    if (sub) {
                      console.log(`[SES Webhook] Marking ${email} as bounced for user ${campaign.userId}`);
                      await storage.updateSubscriber(sub.id, { status: 'bounced' });
                    }
                  }
                  
                  // Log the bounce event
                  await auditWebhook(AuditActions.WEBHOOK_BOUNCE, `Processed ${bounced.length} bounce(s) for campaign "${campaign.name}"`, { 
                    userId: campaign.userId, 
                    req, 
                    metadata: { 
                      campaignId: campaign.id, 
                      bounceType, 
                      recipients: bounced.map((r: any) => r.emailAddress) 
                    } 
                  });
                }
              }
            } else {
              console.log(`[SES Webhook] No campaign message found for SES messageId: ${sesMessageId}`);
            }
          }
        }

        if (message.notificationType === 'Complaint') {
          const complained = message.complaint?.complainedRecipients || [];
          const sesMessageId = message.mail?.messageId;
          console.log(`[SES Webhook] Processing ${complained.length} complained recipients, messageId: ${sesMessageId}`);
          
          if (sesMessageId) {
            const campaignMsg = await storage.getCampaignMessageBySesId(sesMessageId);
            if (campaignMsg) {
              // Create email event
              await storage.createEmailEvent({
                campaignMessageId: campaignMsg.id,
                eventType: 'complaint',
                eventData: { complaintType: message.complaint?.complaintFeedbackType || 'unknown' },
              });
              
              // Update subscriber status (scoped to the campaign's user)
              const campaign = await storage.getCampaign(campaignMsg.campaignId);
              if (campaign && campaign.userId) {
                for (const recipient of complained) {
                  const email = recipient.emailAddress?.toLowerCase();
                  if (!email) continue;
                  
                  const sub = await storage.getSubscriberByEmail(email, campaign.userId);
                  if (sub) {
                    console.log(`[SES Webhook] Marking ${email} as complained for user ${campaign.userId}`);
                    await storage.updateSubscriber(sub.id, { status: 'complained' });
                  }
                }
                
                // Log the complaint event
                await auditWebhook(AuditActions.WEBHOOK_COMPLAINT, `Processed ${complained.length} complaint(s) for campaign "${campaign.name}"`, { 
                  userId: campaign.userId, 
                  req, 
                  metadata: { 
                    campaignId: campaign.id, 
                    recipients: complained.map((r: any) => r.emailAddress),
                    complaintType: message.complaint?.complaintFeedbackType || 'unknown'
                  } 
                });
              }
            }
          }
        }
        
        if (message.notificationType === 'Delivery') {
          console.log("[SES Webhook] Delivery notification received");
          // Delivery confirmations can be processed here if needed
        }
      }

      res.status(200).send("OK");
    } catch (error) {
      console.error("[SES Webhook] Error:", error);
      // Always return 200 to prevent SNS from retrying
      res.status(200).send("OK");
    }
  });
  
  // Endpoint to get webhook URL for SES configuration
  app.get("/api/webhooks/ses/info", requireAuth, async (req, res) => {
    const host = req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const webhookUrl = `${protocol}://${host}/api/webhooks/ses`;
    res.json({ 
      webhookUrl,
      instructions: [
        "1. Go to AWS SNS Console and create a new topic (e.g., 'ses-bounces')",
        "2. Create an HTTPS subscription pointing to the webhook URL above",
        "3. Go to AWS SES Console > Verified Identities > Your Domain/Email",
        "4. Under Notifications, set the SNS topic for Bounces and Complaints",
        "5. The webhook will automatically confirm the SNS subscription"
      ]
    });
  });

  // Test endpoint to simulate bounce notification (Admin only)
  app.post("/api/webhooks/ses/test", requireAdmin, async (req, res) => {
    try {
      const { campaignId, email, type = 'bounce' } = req.body;
      
      if (!campaignId || !email) {
        return res.status(400).json({ error: "campaignId and email are required" });
      }

      // Find the campaign message
      const messages = await storage.getCampaignMessages(campaignId);
      const message = messages.find(m => m.email === email);
      
      if (!message) {
        return res.status(404).json({ error: `No message found for email ${email} in campaign ${campaignId}` });
      }

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      if (type === 'bounce') {
        // Simulate bounce
        await storage.updateCampaignMessage(message.id, { 
          status: 'bounced',
          bouncedAt: new Date() 
        });
        
        await storage.createEmailEvent({
          campaignMessageId: message.id,
          eventType: 'bounce',
          eventData: { bounceType: 'Permanent', recipients: [email], simulated: true },
        });
        
        await storage.updateCampaign(campaign.id, { 
          totalBounced: campaign.totalBounced + 1 
        });

        // Update subscriber status
        const userId = getSessionUserId(req)!;
        const subs = await storage.getSubscribers(userId);
        const sub = subs.find(s => s.email.toLowerCase() === email.toLowerCase());
        if (sub) {
          await storage.updateSubscriber(sub.id, { status: 'bounced' });
        }

        console.log(`[TEST] Simulated bounce for ${email} in campaign ${campaignId}`);
        res.json({ success: true, message: `Simulated bounce for ${email}` });
      } else if (type === 'complaint') {
        // Simulate complaint
        await storage.updateCampaignMessage(message.id, { 
          status: 'complained' 
        });
        
        await storage.createEmailEvent({
          campaignMessageId: message.id,
          eventType: 'complaint',
          eventData: { complaintType: 'abuse', recipients: [email], simulated: true },
        });
        
        await storage.updateCampaign(campaign.id, { 
          totalComplaints: campaign.totalComplaints + 1 
        });

        // Update subscriber status
        const userId = getSessionUserId(req)!;
        const subs = await storage.getSubscribers(userId);
        const sub = subs.find(s => s.email.toLowerCase() === email.toLowerCase());
        if (sub) {
          await storage.updateSubscriber(sub.id, { status: 'complained' });
        }

        console.log(`[TEST] Simulated complaint for ${email} in campaign ${campaignId}`);
        res.json({ success: true, message: `Simulated complaint for ${email}` });
      } else {
        res.status(400).json({ error: "Type must be 'bounce' or 'complaint'" });
      }
    } catch (error) {
      console.error("[TEST] Error simulating notification:", error);
      res.status(500).json({ error: "Failed to simulate notification" });
    }
  });

  // Ping endpoint to verify webhook is accessible (publicly accessible)
  app.get("/api/webhooks/ses/ping", async (req, res) => {
    console.log("[SES Webhook] Ping received from:", req.ip);
    res.json({ 
      status: "ok", 
      message: "Webhook is accessible",
      timestamp: new Date().toISOString()
    });
  });

  // Analytics endpoint
  app.get("/api/analytics", requireAuth, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Use tenant-aware data access (owner ID for multi-tenant scoping)
      const ownerId = currentUser.isOwner ? currentUser.id : currentUser.ownerId;
      if (!ownerId) {
        return res.status(403).json({ error: "User is not associated with any organization" });
      }
      
      const camps = await storage.getCampaignsForTenant(ownerId);
      const subs = await storage.getSubscribersForTenant(ownerId);
      
      const totalSent = camps.reduce((sum, c) => sum + c.totalSent, 0);
      const totalDelivered = camps.reduce((sum, c) => sum + c.totalDelivered, 0);
      const totalOpened = camps.reduce((sum, c) => sum + c.totalOpened, 0);
      const totalClicked = camps.reduce((sum, c) => sum + c.totalClicked, 0);
      const totalBounced = camps.reduce((sum, c) => sum + c.totalBounced, 0);
      
      res.json({
        totalSubscribers: subs.length,
        activeSubscribers: subs.filter(s => s.status === 'active').length,
        totalCampaigns: camps.length,
        completedCampaigns: camps.filter(c => c.status === 'completed').length,
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        totalBounced,
        openRate: totalDelivered > 0 ? ((totalOpened / totalDelivered) * 100).toFixed(1) : 0,
        clickRate: totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(1) : 0,
        bounceRate: totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(1) : 0,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // User Management API (Admin only)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const adminUserId = getSessionUserId(req)!;
    try {
      const adminUser = await storage.getUser(adminUserId);
      if (!adminUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const effectiveOwnerId = adminUser.isOwner ? adminUser.id : adminUser.ownerId;
      if (!effectiveOwnerId) {
        return res.status(403).json({ error: "User is not associated with any organization" });
      }
      
      const users = await storage.listUsers(effectiveOwnerId);
      
      res.json(users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isOwner: u.isOwner,
        createdAt: u.createdAt,
      })));
    } catch (error) {
      console.error("Failed to list users:", error);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    const adminUserId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, adminUserId);
    try {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6).optional(),
        name: z.string().min(1),
        role: z.enum([UserRoles.ADMIN, UserRoles.ASSOCIATE, UserRoles.ANALYST]),
        autoGeneratePassword: z.boolean().optional(),
        sendWelcomeEmail: z.boolean().optional(),
      });
      const { email, password, name, role, autoGeneratePassword, sendWelcomeEmail } = schema.parse(req.body);

      // Determine final password
      let finalPassword: string;
      if (autoGeneratePassword) {
        finalPassword = generateSecurePassword(16);
      } else if (password) {
        finalPassword = password;
      } else {
        return res.status(400).json({ error: "Password is required when auto-generate is disabled" });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        await auditAuth(AuditActions.USER_REGISTER, `Admin create user failed - email already exists: ${email}`, { ...ctx, email, status: 'failure' });
        return res.status(400).json({ error: "Email already registered" });
      }

      const hashedPassword = await hashPassword(finalPassword);
      const user = await storage.createUserWithOwner({ email, password: hashedPassword, name, role }, adminUserId);

      // Send welcome email if requested
      let emailSent = false;
      let emailError: string | undefined;
      if (sendWelcomeEmail) {
        const adminCreds = await storage.getSesCredentialsDecrypted(adminUserId);
        if (adminCreds && adminCreds.isVerified) {
          const loginUrl = `${req.protocol}://${req.get('host')}/login`;
          const htmlBody = generateWelcomeEmailHtml(name, email, finalPassword, loginUrl);
          
          let result;
          if (adminCreds.protocol === 'smtp' && adminCreds.smtpHost && adminCreds.smtpUser && adminCreds.decryptedSmtpPassword) {
            result = await sendTransactionalEmail('smtp', {
              host: adminCreds.smtpHost,
              port: adminCreds.smtpPort || 587,
              user: adminCreds.smtpUser,
              password: adminCreds.decryptedSmtpPassword,
            }, {
              to: email,
              subject: 'Welcome to SmartBridge Campaigns - Your Account Credentials',
              htmlBody,
              fromEmail: adminCreds.fromEmail,
              fromName: adminCreds.fromName,
            });
          } else if (adminCreds.protocol === 'api' && adminCreds.accessKeyId && adminCreds.decryptedSecretAccessKey && adminCreds.region) {
            result = await sendTransactionalEmail('api', {
              accessKeyId: adminCreds.accessKeyId,
              secretAccessKey: adminCreds.decryptedSecretAccessKey,
              region: adminCreds.region,
            }, {
              to: email,
              subject: 'Welcome to SmartBridge Campaigns - Your Account Credentials',
              htmlBody,
              fromEmail: adminCreds.fromEmail,
              fromName: adminCreds.fromName,
            });
          }
          
          if (result?.success) {
            emailSent = true;
          } else {
            emailError = result?.error || 'Failed to send email';
          }
        } else {
          emailError = 'No verified SES credentials configured';
        }
      }

      await auditAuth(AuditActions.USER_REGISTER, `Admin created new user: ${email} with role: ${role}`, { 
        ...ctx, 
        resourceId: user.id,
        resourceType: 'user',
        email, 
        status: 'success', 
        metadata: { role, createdByAdmin: adminUserId, autoGeneratedPassword: !!autoGeneratePassword, welcomeEmailSent: emailSent } 
      });
      
      res.status(201).json({ 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role,
        generatedPassword: autoGeneratePassword ? finalPassword : undefined,
        welcomeEmailSent: emailSent,
        welcomeEmailError: emailError,
      });
    } catch (error: any) {
      const validationError = fromError(error);
      await auditAuth(AuditActions.USER_REGISTER, `Admin create user failed: ${validationError.toString()}`, { ...ctx, status: 'failure', errorMessage: validationError.toString() });
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const adminUserId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, adminUserId);
    const targetUserId = req.params.id;
    
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        role: z.enum([UserRoles.ADMIN, UserRoles.ASSOCIATE, UserRoles.ANALYST]).optional(),
        password: z.string().min(6).optional(),
      });
      const updates = schema.parse(req.body);

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prevent modifying the owner's role
      if (targetUser.isOwner && updates.role) {
        return res.status(403).json({ error: "Cannot change the owner's role" });
      }

      // Prevent admin from demoting themselves
      if (targetUserId === adminUserId && updates.role && updates.role !== UserRoles.ADMIN) {
        return res.status(400).json({ error: "Cannot change your own role" });
      }

      const updateData: any = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.role) updateData.role = updates.role;
      if (updates.password) updateData.password = await hashPassword(updates.password);

      const user = await storage.updateUser(targetUserId, updateData);

      await auditAuth(AuditActions.USER_REGISTER, `Admin updated user: ${targetUser.email}`, { 
        ...ctx, 
        resourceId: targetUserId,
        resourceType: 'user',
        status: 'success', 
        metadata: { changes: Object.keys(updates), updatedByAdmin: adminUserId } 
      });
      res.json({ id: user!.id, email: user!.email, name: user!.name, role: user!.role });
    } catch (error: any) {
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.toString() });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const adminUserId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, adminUserId);
    const targetUserId = req.params.id;

    try {
      // Prevent admin from deleting themselves
      if (targetUserId === adminUserId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Prevent deleting the owner
      if (targetUser.isOwner) {
        return res.status(403).json({ error: "Cannot delete the owner account" });
      }

      await storage.deleteUser(targetUserId);

      await auditAuth(AuditActions.USER_REGISTER, `Admin deleted user: ${targetUser.email}`, { 
        ...ctx, 
        resourceId: targetUserId,
        resourceType: 'user',
        status: 'success', 
        metadata: { deletedEmail: targetUser.email, deletedByAdmin: adminUserId } 
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Audit Logs API (Admin only)
  app.get("/api/audit-logs", requireAdmin, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const category = req.query.category as string | undefined;
      const action = req.query.action as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const result = await storage.getAuditLogsPaged(userId, page, limit, {
        category,
        action,
        status,
        search,
        startDate,
        endDate,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // Get audit log categories and actions for filtering (Admin only)
  app.get("/api/audit-logs/filters", requireAdmin, async (req, res) => {
    res.json({
      categories: Object.values(AuditCategories),
      actions: Object.values(AuditActions),
      statuses: ['success', 'failure', 'warning'],
    });
  });

  // Export audit logs as CSV (Admin only)
  app.get("/api/audit-logs/export", requireAdmin, async (req, res) => {
    try {
      const userId = getSessionUserId(req)!;
      const ctx = createAuditContext(req, userId);
      const category = req.query.category as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const logs = await storage.getAuditLogs(userId, {
        category,
        startDate,
        endDate,
      });
      
      const csvHeader = 'Timestamp,Action,Category,Description,Status,IP Address,User Agent\n';
      const csvRows = logs.map(log => {
        return `"${log.createdAt}","${log.action}","${log.category}","${log.description.replace(/"/g, '""')}","${log.status}","${log.ipAddress || ''}","${(log.userAgent || '').replace(/"/g, '""')}"`;
      }).join('\n');
      
      await audit(AuditActions.SUBSCRIBER_EXPORT, AuditCategories.SYSTEM, `Exported ${logs.length} audit logs`, { ...ctx, metadata: { count: logs.length } });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeader + csvRows);
    } catch (error) {
      console.error("Failed to export audit logs:", error);
      res.status(500).json({ error: "Failed to export audit logs" });
    }
  });

  // AI Email Template Generation (Admin & Associate)
  app.post("/api/ai/generate-template", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    try {
      const schema = z.object({
        draftContent: z.string().min(10, "Draft content must be at least 10 characters"),
      });
      const { draftContent } = schema.parse(req.body);

      if (draftContent.length > 50000) {
        return res.status(400).json({ error: "Draft content is too long. Maximum 50,000 characters." });
      }

      const result = await generateEmailTemplate(draftContent);
      
      res.json({
        success: true,
        correctedContent: result.correctedContent,
        htmlTemplate: result.htmlTemplate,
        improvements: result.improvements,
      });
    } catch (error: any) {
      console.error("AI template generation error:", error);
      res.status(500).json({ error: error.message || "Failed to generate email template" });
    }
  });

  // Schedule Campaign (Admin & Associate)
  app.post("/api/campaigns/:id/schedule", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    const campaignId = req.params.id;
    
    try {
      const schema = z.object({
        scheduledFor: z.string().datetime(),
      });
      const { scheduledFor } = schema.parse(req.body);
      
      const scheduledDate = new Date(scheduledFor);
      const now = new Date();
      
      if (scheduledDate <= now) {
        return res.status(400).json({ error: "Scheduled time must be in the future" });
      }

      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only admin or creator can schedule
      const isAdmin = currentUser.role === 'admin';
      const isCreator = campaign.userId === userId;
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: "Only the campaign creator or an admin can schedule this campaign" });
      }

      if (campaign.status !== 'draft') {
        return res.status(400).json({ error: "Only draft campaigns can be scheduled" });
      }

      if (!campaign.testEmailSentAt) {
        return res.status(400).json({ error: "Please send a test email before scheduling this campaign" });
      }

      if (!campaign.segmentId) {
        return res.status(400).json({ error: "Please select a segment before scheduling the campaign" });
      }

      const creds = await storage.getSesCredentialsDecrypted(userId);
      if (!creds || !creds.isVerified) {
        return res.status(400).json({ error: "Please configure and verify AWS SES credentials in Settings first" });
      }

      const updated = await storage.updateCampaign(campaignId, {
        status: 'scheduled',
        scheduledFor: scheduledDate,
      });

      await auditCampaign(AuditActions.CAMPAIGN_UPDATE, `Scheduled campaign "${campaign.name}" for ${scheduledDate.toISOString()}`, { 
        ...ctx, 
        campaignId, 
        metadata: { scheduledFor: scheduledDate.toISOString() } 
      });

      res.json({
        success: true,
        campaign: updated,
        message: `Campaign scheduled for ${scheduledDate.toLocaleString()}`,
      });
    } catch (error: any) {
      console.error("Schedule campaign error:", error);
      const validationError = fromError(error);
      res.status(400).json({ error: validationError.toString() });
    }
  });

  // Cancel scheduled campaign (Admin & Associate)
  app.post("/api/campaigns/:id/unschedule", requireCampaignAccess, async (req, res) => {
    const userId = getSessionUserId(req)!;
    const ctx = createAuditContext(req, userId);
    const campaignId = req.params.id;
    
    try {
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Only admin or creator can unschedule
      const isAdmin = currentUser.role === 'admin';
      const isCreator = campaign.userId === userId;
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ error: "Only the campaign creator or an admin can unschedule this campaign" });
      }

      if (campaign.status !== 'scheduled') {
        return res.status(400).json({ error: "Only scheduled campaigns can be unscheduled" });
      }

      const updated = await storage.updateCampaign(campaignId, {
        status: 'draft',
        scheduledFor: null,
      });

      await auditCampaign(AuditActions.CAMPAIGN_UPDATE, `Unscheduled campaign "${campaign.name}"`, { 
        ...ctx, 
        campaignId 
      });

      res.json({
        success: true,
        campaign: updated,
        message: "Campaign unscheduled and returned to draft status",
      });
    } catch (error: any) {
      console.error("Unschedule campaign error:", error);
      res.status(500).json({ error: error.message || "Failed to unschedule campaign" });
    }
  });

  return httpServer;
}
