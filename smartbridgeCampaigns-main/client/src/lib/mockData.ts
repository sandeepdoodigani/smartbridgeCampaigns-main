
export interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';
  sentAt?: string;
  scheduledFor?: string;
  stats: {
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complaints: number;
  };
}

export interface Subscriber {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'unsubscribed' | 'bounced';
  tags: string[];
  addedAt: string;
}

export interface Segment {
  id: string;
  name: string;
  description: string;
  count: number;
  rules: string[];
}

export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'c-1',
    name: 'Welcome Series - Email 1',
    subject: 'Welcome to the platform! 🚀',
    status: 'completed',
    sentAt: '2024-03-10T10:00:00Z',
    stats: {
      total: 12500,
      sent: 12500,
      delivered: 12450,
      opened: 8900,
      clicked: 3200,
      bounced: 45,
      complaints: 5,
    },
  },
  {
    id: 'c-2',
    name: 'March Newsletter',
    subject: 'Product updates and new features',
    status: 'completed',
    sentAt: '2024-03-15T14:30:00Z',
    stats: {
      total: 45000,
      sent: 45000,
      delivered: 44800,
      opened: 22000,
      clicked: 5600,
      bounced: 180,
      complaints: 20,
    },
  },
  {
    id: 'c-3',
    name: 'Q2 Promotion',
    subject: 'Exclusive 20% off for loyal customers',
    status: 'sending',
    sentAt: '2024-03-20T09:00:00Z',
    stats: {
      total: 25000,
      sent: 12000,
      delivered: 11950,
      opened: 4500,
      clicked: 1200,
      bounced: 40,
      complaints: 2,
    },
  },
  {
    id: 'c-4',
    name: 'Re-engagement Campaign',
    subject: 'We miss you! Come back.',
    status: 'draft',
    stats: {
      total: 5000,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complaints: 0,
    },
  },
  {
    id: 'c-5',
    name: 'Webinar Invite',
    subject: 'Join us for a live demo',
    status: 'scheduled',
    scheduledFor: '2024-03-25T15:00:00Z',
    stats: {
      total: 8000,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complaints: 0,
    },
  },
];

export const ANALYTICS_DATA = [
  { date: 'Mar 10', sent: 12500, opened: 8900, clicked: 3200 },
  { date: 'Mar 11', sent: 2000, opened: 1500, clicked: 400 },
  { date: 'Mar 12', sent: 1500, opened: 1100, clicked: 300 },
  { date: 'Mar 13', sent: 3000, opened: 2100, clicked: 700 },
  { date: 'Mar 14', sent: 1000, opened: 800, clicked: 200 },
  { date: 'Mar 15', sent: 45000, opened: 22000, clicked: 5600 },
  { date: 'Mar 16', sent: 5000, opened: 3500, clicked: 900 },
  { date: 'Mar 17', sent: 2500, opened: 1800, clicked: 500 },
  { date: 'Mar 18', sent: 3500, opened: 2500, clicked: 800 },
  { date: 'Mar 19', sent: 1500, opened: 1000, clicked: 300 },
  { date: 'Mar 20', sent: 12000, opened: 4500, clicked: 1200 },
];

export const MOCK_SUBSCRIBERS: Subscriber[] = [
  { id: '1', email: 'alice@example.com', firstName: 'Alice', lastName: 'Smith', status: 'active', tags: ['new-user', 'webinar'], addedAt: '2024-03-01' },
  { id: '2', email: 'bob@example.com', firstName: 'Bob', lastName: 'Johnson', status: 'active', tags: ['enterprise'], addedAt: '2024-02-15' },
  { id: '3', email: 'charlie@example.com', firstName: 'Charlie', lastName: 'Brown', status: 'unsubscribed', tags: [], addedAt: '2024-01-10' },
  { id: '4', email: 'diana@example.com', firstName: 'Diana', lastName: 'Prince', status: 'active', tags: ['vip'], addedAt: '2024-03-18' },
  { id: '5', email: 'evan@example.com', firstName: 'Evan', lastName: 'Wright', status: 'bounced', tags: ['newsletter'], addedAt: '2023-12-05' },
];

export const MOCK_SEGMENTS: Segment[] = [
  { id: 's1', name: 'All Subscribers', description: 'Everyone in your list', count: 12500, rules: ['All contacts'] },
  { id: 's2', name: 'New Users (30 Days)', description: 'Signed up in the last month', count: 450, rules: ['Joined < 30 days ago'] },
  { id: 's3', name: 'VIP Customers', description: 'High value active users', count: 120, rules: ['Tag is VIP', 'Status is Active'] },
  { id: 's4', name: 'Inactive (90 Days)', description: 'No opens in 3 months', count: 2300, rules: ['Last Open > 90 days ago'] },
];
