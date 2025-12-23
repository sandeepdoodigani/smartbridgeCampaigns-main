import { storage } from "./storage";
import { AuditActions, AuditCategories, type InsertAuditLog } from "@shared/schema";
import type { Request } from "express";

export { AuditActions, AuditCategories };

interface AuditContext {
  userId?: string;
  req?: Request;
  startTime?: number;
}

export async function audit(
  action: string,
  category: string,
  description: string,
  context: AuditContext & {
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    status?: 'success' | 'failure' | 'warning';
    errorMessage?: string;
  }
): Promise<void> {
  try {
    const duration = context.startTime ? Date.now() - context.startTime : undefined;
    
    const log: InsertAuditLog = {
      userId: context.userId,
      action,
      category,
      description,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      metadata: context.metadata,
      ipAddress: context.req ? getClientIp(context.req) : undefined,
      userAgent: context.req?.get('user-agent'),
      status: context.status || 'success',
      errorMessage: context.errorMessage,
      duration,
    };
    
    await storage.createAuditLog(log);
  } catch (error) {
    console.error('[Audit] Failed to create audit log:', error);
  }
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress;
}

export function createAuditContext(req: Request, userId?: string): AuditContext {
  return {
    userId,
    req,
    startTime: Date.now(),
  };
}

export async function auditAuth(
  action: typeof AuditActions.USER_LOGIN | typeof AuditActions.USER_LOGOUT | typeof AuditActions.USER_REGISTER | typeof AuditActions.USER_LOGIN_FAILED | typeof AuditActions.USER_PASSWORD_CHANGE,
  description: string,
  context: AuditContext & {
    email?: string;
    status?: 'success' | 'failure';
    errorMessage?: string;
    metadata?: Record<string, any>;
    resourceType?: string;
    resourceId?: string;
  }
): Promise<void> {
  await audit(action, AuditCategories.AUTH, description, {
    ...context,
    metadata: context.metadata || (context.email ? { email: context.email } : undefined),
  });
}

export async function auditSettings(
  action: string,
  description: string,
  context: AuditContext & {
    metadata?: Record<string, any>;
    status?: 'success' | 'failure';
    errorMessage?: string;
  }
): Promise<void> {
  await audit(action, AuditCategories.SETTINGS, description, context);
}

export async function auditSubscriber(
  action: string,
  description: string,
  context: AuditContext & {
    subscriberId?: string;
    metadata?: Record<string, any>;
    status?: 'success' | 'failure';
    errorMessage?: string;
  }
): Promise<void> {
  await audit(action, AuditCategories.SUBSCRIBER, description, {
    ...context,
    resourceType: 'subscriber',
    resourceId: context.subscriberId,
  });
}

export async function auditSegment(
  action: string,
  description: string,
  context: AuditContext & {
    segmentId?: string;
    metadata?: Record<string, any>;
    status?: 'success' | 'failure';
    errorMessage?: string;
  }
): Promise<void> {
  await audit(action, AuditCategories.SEGMENT, description, {
    ...context,
    resourceType: 'segment',
    resourceId: context.segmentId,
  });
}

export async function auditCampaign(
  action: string,
  description: string,
  context: AuditContext & {
    campaignId?: string;
    metadata?: Record<string, any>;
    status?: 'success' | 'failure';
    errorMessage?: string;
  }
): Promise<void> {
  await audit(action, AuditCategories.CAMPAIGN, description, {
    ...context,
    resourceType: 'campaign',
    resourceId: context.campaignId,
  });
}

export async function auditWebhook(
  action: string,
  description: string,
  context: AuditContext & {
    metadata?: Record<string, any>;
    status?: 'success' | 'failure';
    errorMessage?: string;
  }
): Promise<void> {
  await audit(action, AuditCategories.WEBHOOK, description, context);
}

export async function auditSystem(
  action: string,
  description: string,
  context: AuditContext & {
    metadata?: Record<string, any>;
    status?: 'success' | 'failure';
    errorMessage?: string;
  }
): Promise<void> {
  await audit(action, AuditCategories.SYSTEM, description, context);
}
