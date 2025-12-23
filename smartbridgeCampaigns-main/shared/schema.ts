import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User roles
export const UserRoles = {
  ADMIN: 'admin',
  ASSOCIATE: 'associate',
  ANALYST: 'analyst',
} as const;

export type UserRole = typeof UserRoles[keyof typeof UserRoles];

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"),
  isOwner: boolean("is_owner").notNull().default(false),
  ownerId: varchar("owner_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  ownerId: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// SES Credentials table - supports both API and SMTP protocols
export const sesCredentials = pgTable("ses_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  protocol: text("protocol").notNull().default("api"),
  // API mode fields
  accessKeyId: text("access_key_id"),
  secretAccessKey: text("secret_access_key"),
  region: text("region").default("us-east-1"),
  // SMTP mode fields
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  // Common fields
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSesCredentialsSchema = createInsertSchema(sesCredentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isVerified: true,
});

export type InsertSesCredentials = z.infer<typeof insertSesCredentialsSchema>;
export type SesCredentials = typeof sesCredentials.$inferSelect;

// Sender Identities - multiple from email addresses per owner
export const senderIdentities = pgTable("sender_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSenderIdentitySchema = createInsertSchema(senderIdentities).omit({
  id: true,
  createdAt: true,
  isVerified: true,
  isActive: true,
});

export type InsertSenderIdentity = z.infer<typeof insertSenderIdentitySchema>;
export type SenderIdentity = typeof senderIdentities.$inferSelect;

// Subscribers table
export const subscribers = pgTable("subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  status: text("status").notNull().default("active"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertSubscriberSchema = createInsertSchema(subscribers).omit({
  id: true,
  addedAt: true,
});

export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Subscriber = typeof subscribers.$inferSelect;

// Segments table
export const segments = pgTable("segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  rules: jsonb("rules").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSegmentSchema = createInsertSchema(segments).omit({
  id: true,
  createdAt: true,
});

export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type Segment = typeof segments.$inferSelect;

// Campaigns table
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content"),
  status: text("status").notNull().default("draft"),
  segmentId: text("segment_id"),
  senderIdentityId: varchar("sender_identity_id").references(() => senderIdentities.id),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  testEmailSentAt: timestamp("test_email_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  totalSent: integer("total_sent").notNull().default(0),
  totalDelivered: integer("total_delivered").notNull().default(0),
  totalOpened: integer("total_opened").notNull().default(0),
  totalClicked: integer("total_clicked").notNull().default(0),
  totalBounced: integer("total_bounced").notNull().default(0),
  totalComplaints: integer("total_complaints").notNull().default(0),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  sentAt: true,
  testEmailSentAt: true,
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

// Campaign Messages - individual emails sent to subscribers
export const campaignMessages = pgTable("campaign_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id),
  subscriberId: varchar("subscriber_id").notNull().references(() => subscribers.id),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  bouncedAt: timestamp("bounced_at"),
  trackingToken: text("tracking_token").notNull(),
});

export const insertCampaignMessageSchema = createInsertSchema(campaignMessages).omit({
  id: true,
});

export type InsertCampaignMessage = z.infer<typeof insertCampaignMessageSchema>;
export type CampaignMessage = typeof campaignMessages.$inferSelect;

// Email Events - tracking opens, clicks, bounces, complaints
export const emailEvents = pgTable("email_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignMessageId: varchar("campaign_message_id").references(() => campaignMessages.id),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEvents.$inferSelect;

// Test Email Logs - track test emails sent for campaigns
export const testEmailLogs = pgTable("test_email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  recipientEmail: text("recipient_email").notNull(),
  senderEmail: text("sender_email").notNull(),
  senderName: text("sender_name"),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("sent"), // sent, failed
  messageId: text("message_id"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertTestEmailLogSchema = createInsertSchema(testEmailLogs).omit({
  id: true,
  sentAt: true,
});

export type InsertTestEmailLog = z.infer<typeof insertTestEmailLogSchema>;
export type TestEmailLog = typeof testEmailLogs.$inferSelect;

// Campaign Jobs - for tracking large campaign sending progress
export const campaignJobs = pgTable("campaign_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => campaigns.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending, processing, paused, completed, failed
  totalRecipients: integer("total_recipients").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  currentBatch: integer("current_batch").notNull().default(0),
  totalBatches: integer("total_batches").notNull().default(0),
  batchSize: integer("batch_size").notNull().default(50),
  delayBetweenBatches: integer("delay_between_batches").notNull().default(1000), // ms
  lastError: text("last_error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCampaignJobSchema = createInsertSchema(campaignJobs).omit({
  id: true,
  createdAt: true,
});

export type InsertCampaignJob = z.infer<typeof insertCampaignJobSchema>;
export type CampaignJob = typeof campaignJobs.$inferSelect;

// Audit Logs - Enterprise-grade activity tracking
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(), // e.g., 'user.login', 'campaign.create', 'subscriber.import'
  category: text("category").notNull(), // auth, campaign, subscriber, segment, settings, system
  resourceType: text("resource_type"), // campaign, subscriber, segment, etc.
  resourceId: text("resource_id"), // ID of the affected resource
  description: text("description").notNull(), // Human-readable description
  metadata: jsonb("metadata"), // Additional context (old/new values, counts, etc.)
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  status: text("status").notNull().default("success"), // success, failure, warning
  errorMessage: text("error_message"),
  duration: integer("duration"), // Operation duration in ms
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Audit action constants for type safety
export const AuditActions = {
  // Authentication
  USER_REGISTER: 'user.register',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_PASSWORD_CHANGE: 'user.password_change',
  
  // SES Settings
  SES_CREDENTIALS_CREATE: 'ses.credentials_create',
  SES_CREDENTIALS_UPDATE: 'ses.credentials_update',
  SES_CREDENTIALS_DELETE: 'ses.credentials_delete',
  SES_CREDENTIALS_VERIFY: 'ses.credentials_verify',
  SES_TEST_EMAIL: 'ses.test_email',
  
  // Subscribers
  SUBSCRIBER_CREATE: 'subscriber.create',
  SUBSCRIBER_UPDATE: 'subscriber.update',
  SUBSCRIBER_DELETE: 'subscriber.delete',
  SUBSCRIBER_IMPORT: 'subscriber.import',
  SUBSCRIBER_EXPORT: 'subscriber.export',
  
  // Segments
  SEGMENT_CREATE: 'segment.create',
  SEGMENT_UPDATE: 'segment.update',
  SEGMENT_DELETE: 'segment.delete',
  
  // Campaigns
  CAMPAIGN_CREATE: 'campaign.create',
  CAMPAIGN_UPDATE: 'campaign.update',
  CAMPAIGN_DELETE: 'campaign.delete',
  CAMPAIGN_SEND: 'campaign.send',
  CAMPAIGN_PAUSE: 'campaign.pause',
  CAMPAIGN_RESUME: 'campaign.resume',
  CAMPAIGN_TEST_SEND: 'campaign.test_send',
  
  // Webhooks
  WEBHOOK_BOUNCE: 'webhook.bounce',
  WEBHOOK_COMPLAINT: 'webhook.complaint',
  WEBHOOK_DELIVERY: 'webhook.delivery',
  
  // System
  SYSTEM_ERROR: 'system.error',
} as const;

export const AuditCategories = {
  AUTH: 'auth',
  CAMPAIGN: 'campaign',
  SUBSCRIBER: 'subscriber',
  SEGMENT: 'segment',
  SETTINGS: 'settings',
  WEBHOOK: 'webhook',
  SYSTEM: 'system',
} as const;
