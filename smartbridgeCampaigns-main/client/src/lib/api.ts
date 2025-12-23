import type { Subscriber, Segment, Campaign, User } from "@shared/schema";

const API_BASE = "/api";

const fetchWithCredentials = (url: string, options?: RequestInit): Promise<Response> => {
  return fetch(url, { ...options, credentials: 'include' });
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}

export type UserRole = 'admin' | 'associate' | 'analyst';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isOwner?: boolean;
}

export interface SESSettings {
  id?: string;
  protocol: 'api' | 'smtp';
  accessKeyId?: string | null;
  region?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  fromEmail: string;
  fromName: string;
  isVerified: boolean;
}

export interface Analytics {
  totalSubscribers: number;
  activeSubscribers: number;
  totalCampaigns: number;
  completedCampaigns: number;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  openRate: string | number;
  clickRate: string | number;
  bounceRate: string | number;
}

export interface SenderIdentity {
  id: string;
  ownerId: string;
  email: string;
  name: string;
  isDefault: boolean;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export const api = {
  // Auth
  auth: {
    login: async (data: { email: string; password: string }): Promise<AuthUser> => {
      const res = await fetchWithCredentials(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    logout: async (): Promise<void> => {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    },

    me: async (): Promise<AuthUser | null> => {
      const res = await fetchWithCredentials(`${API_BASE}/auth/me`);
      if (res.status === 401) return null;
      return handleResponse(res);
    },

    changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<{ success: boolean; message: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/auth/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },
  },

  // Settings
  settings: {
    getSES: async (): Promise<SESSettings | null> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/ses`);
      if (!res.ok) throw new Error("Failed to fetch SES settings");
      return res.json();
    },

    getWebhookInfo: async (): Promise<{ webhookUrl: string; instructions: string[] }> => {
      const res = await fetchWithCredentials(`${API_BASE}/webhooks/ses/info`);
      return handleResponse(res);
    },

    saveSESApi: async (data: {
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
      fromEmail: string;
      fromName: string;
    }): Promise<{ success: boolean; isVerified: boolean; verificationStatus?: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/ses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    saveSESSMTP: async (data: {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPassword: string;
      fromEmail: string;
      fromName: string;
    }): Promise<{ success: boolean; isVerified: boolean }> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/ses/smtp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    getSenders: async (): Promise<SenderIdentity[]> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/senders`);
      return handleResponse(res);
    },

    createSender: async (data: { email: string; name: string; isDefault?: boolean }): Promise<SenderIdentity> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/senders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    updateSender: async (id: string, data: { email?: string; name?: string; isDefault?: boolean }): Promise<SenderIdentity> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/senders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    deleteSender: async (id: string): Promise<{ success: boolean }> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/senders/${id}`, {
        method: "DELETE",
      });
      return handleResponse(res);
    },

    activateSender: async (id: string): Promise<SenderIdentity> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/senders/${id}/activate`, {
        method: "PATCH",
      });
      return handleResponse(res);
    },

    deactivateSender: async (id: string): Promise<SenderIdentity> => {
      const res = await fetchWithCredentials(`${API_BASE}/settings/senders/${id}/deactivate`, {
        method: "PATCH",
      });
      return handleResponse(res);
    },
  },

  // Analytics
  analytics: {
    get: async (): Promise<Analytics> => {
      const res = await fetchWithCredentials(`${API_BASE}/analytics`);
      return handleResponse(res);
    },
  },

  // Tags
  tags: {
    getAll: async (): Promise<string[]> => {
      const res = await fetchWithCredentials(`${API_BASE}/tags`);
      return handleResponse(res);
    },
    deleteSubscribersByTag: async (tag: string): Promise<{ success: boolean; deletedCount: number; message: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/subscribers/by-tag/${encodeURIComponent(tag)}`, {
        method: "DELETE",
      });
      return handleResponse(res);
    },
    removeTag: async (tag: string): Promise<{ success: boolean; updatedCount: number; message: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/tags/${encodeURIComponent(tag)}`, {
        method: "DELETE",
      });
      return handleResponse(res);
    },
  },

  // Subscribers
  subscribers: {
    getAll: async (params?: { page?: number; limit?: number; search?: string; status?: string; tag?: string }): Promise<{
      subscribers: Subscriber[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }> => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.search) searchParams.set('search', params.search);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.tag) searchParams.set('tag', params.tag);
      const url = searchParams.toString() ? `${API_BASE}/subscribers?${searchParams}` : `${API_BASE}/subscribers`;
      const res = await fetchWithCredentials(url);
      return handleResponse(res);
    },

    get: async (id: string): Promise<Subscriber> => {
      const res = await fetchWithCredentials(`${API_BASE}/subscribers/${id}`);
      return handleResponse(res);
    },

    create: async (data: Partial<Subscriber>): Promise<Subscriber> => {
      const res = await fetchWithCredentials(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    bulkCreate: async (subscribers: Partial<Subscriber>[]): Promise<{ count: number; created: number; updated: number; subscribers: Subscriber[] }> => {
      const res = await fetchWithCredentials(`${API_BASE}/subscribers/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribers }),
      });
      return handleResponse(res);
    },

    update: async (id: string, data: Partial<Subscriber>): Promise<Subscriber> => {
      const res = await fetchWithCredentials(`${API_BASE}/subscribers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    delete: async (id: string): Promise<void> => {
      const res = await fetchWithCredentials(`${API_BASE}/subscribers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete subscriber");
    },
  },

  // Segments
  segments: {
    getAll: async (): Promise<(Segment & { count: number })[]> => {
      const res = await fetchWithCredentials(`${API_BASE}/segments`);
      return handleResponse(res);
    },

    get: async (id: string): Promise<Segment & { count: number }> => {
      const res = await fetchWithCredentials(`${API_BASE}/segments/${id}`);
      return handleResponse(res);
    },

    create: async (data: Partial<Segment>): Promise<Segment> => {
      const res = await fetchWithCredentials(`${API_BASE}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    update: async (id: string, data: Partial<Segment>): Promise<Segment> => {
      const res = await fetchWithCredentials(`${API_BASE}/segments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    delete: async (id: string): Promise<void> => {
      const res = await fetchWithCredentials(`${API_BASE}/segments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete segment");
    },
  },

  // Campaigns
  campaigns: {
    getAll: async (): Promise<Campaign[]> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns`);
      return handleResponse(res);
    },

    get: async (id: string): Promise<Campaign> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}`);
      return handleResponse(res);
    },

    create: async (data: Partial<Campaign>): Promise<Campaign> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    update: async (id: string, data: Partial<Campaign>): Promise<Campaign> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    delete: async (id: string): Promise<void> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
    },

    send: async (id: string, options?: { batchSize?: number; delayBetweenBatches?: number }): Promise<{ 
      success: boolean; 
      jobId: string; 
      totalRecipients: number; 
      totalBatches: number;
      message: string;
    }> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options || {}),
      });
      return handleResponse(res);
    },

    getJobStatus: async (id: string): Promise<{
      hasJob: boolean;
      jobId?: string;
      status?: string;
      progress?: number;
      totalRecipients?: number;
      processedCount?: number;
      sentCount?: number;
      failedCount?: number;
      currentBatch?: number;
      totalBatches?: number;
      startedAt?: string;
      finishedAt?: string;
      lastError?: string;
      isActive?: boolean;
    }> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}/job`);
      return handleResponse(res);
    },

    pause: async (id: string): Promise<{ success: boolean; message: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}/pause`, {
        method: "POST",
      });
      return handleResponse(res);
    },

    sendTest: async (data: {
      subject: string;
      htmlContent: string;
      testEmail: string;
      senderIdentityId: string;
      campaignId?: string;
    }): Promise<{ success: boolean; message: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    schedule: async (id: string, scheduledFor: string): Promise<{ success: boolean; campaign: Campaign; message: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor }),
      });
      return handleResponse(res);
    },

    unschedule: async (id: string): Promise<{ success: boolean; campaign: Campaign; message: string }> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}/unschedule`, {
        method: "POST",
      });
      return handleResponse(res);
    },

    getRecipients: async (id: string): Promise<{
      recipients: Array<{
        id: string;
        email: string;
        status: string;
        sentAt: string | null;
        deliveredAt: string | null;
        openedAt: string | null;
        clickedAt: string | null;
        bouncedAt: string | null;
      }>;
      total: number;
    }> => {
      const res = await fetchWithCredentials(`${API_BASE}/campaigns/${id}/recipients`);
      return handleResponse(res);
    },
  },

  // AI
  ai: {
    generateTemplate: async (draftContent: string): Promise<{
      success: boolean;
      correctedContent: string;
      htmlTemplate: string;
      improvements: string[];
    }> => {
      const res = await fetchWithCredentials(`${API_BASE}/ai/generate-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftContent }),
      });
      return handleResponse(res);
    },
  },

  // Audit Logs
  auditLogs: {
    list: async (params?: {
      page?: number;
      limit?: number;
      category?: string;
      action?: string;
      status?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    }): Promise<{
      logs: AuditLog[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }> => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.set('page', params.page.toString());
      if (params?.limit) queryParams.set('limit', params.limit.toString());
      if (params?.category) queryParams.set('category', params.category);
      if (params?.action) queryParams.set('action', params.action);
      if (params?.status) queryParams.set('status', params.status);
      if (params?.search) queryParams.set('search', params.search);
      if (params?.startDate) queryParams.set('startDate', params.startDate);
      if (params?.endDate) queryParams.set('endDate', params.endDate);
      
      const res = await fetchWithCredentials(`${API_BASE}/audit-logs?${queryParams.toString()}`);
      return handleResponse(res);
    },

    getFilters: async (): Promise<{
      categories: string[];
      actions: string[];
      statuses: string[];
    }> => {
      const res = await fetchWithCredentials(`${API_BASE}/audit-logs/filters`);
      return handleResponse(res);
    },

    exportUrl: (params?: {
      category?: string;
      startDate?: string;
      endDate?: string;
    }): string => {
      const queryParams = new URLSearchParams();
      if (params?.category) queryParams.set('category', params.category);
      if (params?.startDate) queryParams.set('startDate', params.startDate);
      if (params?.endDate) queryParams.set('endDate', params.endDate);
      return `${API_BASE}/audit-logs/export?${queryParams.toString()}`;
    },
  },

  // Admin User Management
  admin: {
    listUsers: async (): Promise<AdminUser[]> => {
      const res = await fetchWithCredentials(`${API_BASE}/admin/users`);
      return handleResponse(res);
    },

    createUser: async (data: { 
      email: string; 
      password?: string; 
      name: string; 
      role: UserRole;
      autoGeneratePassword?: boolean;
      sendWelcomeEmail?: boolean;
    }): Promise<AuthUser & { 
      generatedPassword?: string; 
      welcomeEmailSent?: boolean; 
      welcomeEmailError?: string;
    }> => {
      const res = await fetchWithCredentials(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    updateUser: async (id: string, data: { name?: string; role?: UserRole; password?: string }): Promise<AuthUser> => {
      const res = await fetchWithCredentials(`${API_BASE}/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return handleResponse(res);
    },

    deleteUser: async (id: string): Promise<{ success: boolean }> => {
      const res = await fetchWithCredentials(`${API_BASE}/admin/users/${id}`, {
        method: "DELETE",
      });
      return handleResponse(res);
    },
  },
};

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isOwner: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  category: string;
  resourceType: string | null;
  resourceId: string | null;
  description: string;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  errorMessage: string | null;
  duration: number | null;
  createdAt: string;
}
