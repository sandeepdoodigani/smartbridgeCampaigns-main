# SmartBridge Campaigns - Email Campaign Management Tool

## Overview
SmartBridge Campaigns is a complete email campaign management tool built with React, Express, and PostgreSQL. It integrates with AWS SES for email sending and includes full analytics tracking.

## Features
- **User Authentication**: Secure login with session-based auth
- **Multi-Role Architecture**: Admin, Associate, and Analyst roles with granular permissions
- **Admin-Only User Provisioning**: Only admins can create users, with optional auto-generated passwords
- **Welcome Emails**: Send login credentials to new users via email automatically
- **Password Management**: Users can change their passwords anytime from Settings
- **AWS SES Integration**: Configure and validate SES credentials (API or SMTP), send emails
- **Multiple Sender Identities**: Admins can configure multiple from email addresses; campaigns can select which sender to use
- **Campaign Management**: Create, send, and track email campaigns with segment targeting
- **Segment-Based Sending**: Campaigns require selecting a segment before sending
- **Subscriber Management**: Import via CSV, add single contacts, manage tags and status
- **Tag-Based Segmentation**: Create segments using tags (all, tags_any, tags_all rules)
- **Visual Email Editor**: Rich text editor with TipTap for composing emails
- **Drag-and-Drop Email Builder**: GrapesJS-powered visual builder for professional email templates
- **AI Email Templates**: Generate professional HTML email templates using Gemini AI
- **Campaign Scheduling**: Schedule campaigns for future sending with date/time picker
- **Campaign Alerts**: Automatic email notifications to admin and associates on campaign start/completion
- **Mandatory Test Emails**: Users must send a test email before launching any campaign (enforced server-side)
- **Analytics Tracking**: Open/click tracking with real-time stats
- **Webhook Support**: Handle SES bounce/complaint notifications
- **Enterprise Audit Logs**: Complete activity tracking for compliance and security

## User Roles
- **Admin**: Full access to all features (settings, subscribers, segments, campaigns, audit logs, user management, role changes, SES configuration)
- **Associate**: Can manage subscribers, segments, and campaigns; view dashboard and analytics; access Settings for password change only
- **Analyst**: View-only access to dashboard and campaign analytics; access Settings for password change only

## Multi-Tenant Architecture
- **Owner-Based Tenancy**: The first admin created via bootstrap becomes the "owner" with `isOwner=true`
- **User Mapping**: All users created by admins are automatically linked via `ownerId` to their organization's owner
- **Shared SES Credentials**: The owner configures AWS SES once, and all users in that organization share those credentials
- **Tenant Isolation**: User lists, SES access, and data are scoped to each organization via `ownerId`
- **Owner Protection**: The owner cannot be deleted or have their role changed by other admins
- **Cross-User Resource Access**: All users in a tenant can access segments and subscribers created by any tenant member
- **Tenant-Aware Queries**: Storage methods use `ownerId` to determine tenant membership, allowing any user in the tenant to access shared resources

Note: User registration is admin-only. The first admin (owner) must be created via the bootstrap script:
```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword ADMIN_NAME="Admin" npx tsx scripts/create-admin.ts
```

## Tech Stack
- **Frontend**: React, Vite, TailwindCSS, shadcn/ui, TanStack Query
- **Backend**: Express, PostgreSQL, Drizzle ORM
- **Email**: AWS SES SDK, tracking pixels
- **Auth**: bcrypt password hashing, express-session

## Project Structure
```
├── client/               # React frontend
│   └── src/
│       ├── components/   # UI components
│       ├── hooks/        # Custom hooks (useAuth)
│       ├── lib/          # API client, utilities
│       └── pages/        # Page components
├── server/               # Express backend
│   ├── aiService.ts     # Gemini AI integration for template generation
│   ├── auth.ts          # Auth utilities
│   ├── campaignWorker.ts # Background worker with scheduler for campaigns
│   ├── crypto.ts        # Encryption for secrets
│   ├── routes.ts        # API endpoints
│   ├── ses.ts           # AWS SES integration
│   └── storage.ts       # Database operations
└── shared/
    └── schema.ts        # Database schema
```

## Database Schema
- **users**: User accounts
- **ses_credentials**: Encrypted AWS SES credentials per user
- **sender_identities**: Multiple from email addresses per owner
- **subscribers**: Email subscribers with status and tags
- **segments**: Audience segments with rules
- **campaigns**: Email campaigns with content, stats, and selected sender identity
- **campaign_messages**: Individual sent emails with tracking
- **email_events**: Open/click/bounce events
- **audit_logs**: Enterprise audit trail with action tracking

## API Endpoints
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user
- `GET/POST /api/settings/ses` - SES credentials
- `GET/POST /api/subscribers` - Subscriber CRUD
- `POST /api/subscribers/bulk` - CSV import
- `GET/POST /api/campaigns` - Campaign CRUD
- `POST /api/campaigns/:id/send` - Send campaign
- `POST /api/campaigns/:id/schedule` - Schedule campaign for future sending
- `POST /api/campaigns/:id/unschedule` - Cancel scheduled campaign
- `POST /api/ai/generate-template` - Generate HTML email template with AI
- `GET /t/open/:token` - Tracking pixel
- `GET /t/click/:token` - Click tracking
- `POST /api/webhooks/ses` - SES notifications
- `GET /api/analytics` - Dashboard stats
- `GET /api/audit-logs` - Paginated audit logs with filtering
- `GET /api/audit-logs/export` - Export audit logs as CSV

## Security
- Passwords hashed with bcrypt
- SES secrets encrypted with AES-256-GCM
- Session-based authentication with httpOnly cookies
- All data routes require authentication
- Multi-tenant data isolation by userId

## Design Theme
- Deep Indigo primary color
- Space Grotesk for headers
- Inter for UI text
- Clean, minimal interface

## Scalability Architecture
- **Large Contact Lists**: CSV import uses 2000-record batches with progress tracking
- **Campaign Sending**: Job-based system with 50-recipient batches and 1-second delays
- **Keyset Pagination**: Uses `WHERE id > lastId` pattern for O(n) performance instead of OFFSET
- **Background Worker**: `campaignWorker.ts` processes campaigns asynchronously with pause/resume
- **Progress Tracking**: Real-time status updates via `/api/campaigns/:id/job/status` polling
- **Resume Capability**: Jobs track lastProcessedId for resuming from interruption
- **UI Pagination**: Subscribers page loads 50 records per page with search and navigation controls
