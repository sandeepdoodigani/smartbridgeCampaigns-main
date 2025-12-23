import { SESClient, SendEmailCommand, GetIdentityVerificationAttributesCommand } from "@aws-sdk/client-ses";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpsAgent } from "https";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";

// HTTP Agent with keep-alive for connection reuse (reduces TLS handshake overhead)
const httpsAgent = new HttpsAgent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 3000,
});

// Reusable HTTP handler for all SES clients
const httpHandler = new NodeHttpHandler({
  httpsAgent,
  connectionTimeout: 5000,
  socketTimeout: 30000,
});

export interface SESConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export async function validateSESCredentials(config: SESConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    const stsClient = new STSClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    await stsClient.send(new GetCallerIdentityCommand({}));
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || "Invalid credentials" };
  }
}

export async function validateSMTPCredentials(config: SMTPConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });

    await transporter.verify();
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || "Invalid SMTP credentials" };
  }
}

export async function verifyEmailIdentity(config: SESConfig, email: string): Promise<{ verified: boolean; status?: string; verifiedVia?: 'email' | 'domain' }> {
  try {
    const sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    const domain = email.split('@')[1];
    const identitiesToCheck = [email];
    if (domain) {
      identitiesToCheck.push(domain);
    }

    const response = await sesClient.send(new GetIdentityVerificationAttributesCommand({
      Identities: identitiesToCheck,
    }));

    const emailAttrs = response.VerificationAttributes?.[email];
    if (emailAttrs?.VerificationStatus === "Success") {
      return { verified: true, status: "Success", verifiedVia: 'email' };
    }

    if (domain) {
      const domainAttrs = response.VerificationAttributes?.[domain];
      if (domainAttrs?.VerificationStatus === "Success") {
        return { verified: true, status: "Success (via domain)", verifiedVia: 'domain' };
      }
    }

    return { verified: false, status: emailAttrs?.VerificationStatus || "NotFound" };
  } catch (error: any) {
    return { verified: false, status: error.message };
  }
}

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  fromEmail: string;
  fromName: string;
  trackingToken: string;
  baseUrl: string;
}

export async function sendEmailViaAPI(config: SESConfig, params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    const htmlWithTracking = injectTracking(params.htmlBody, params.trackingToken, params.baseUrl);

    const command = new SendEmailCommand({
      Source: `${params.fromName} <${params.fromEmail}>`,
      Destination: {
        ToAddresses: [params.to],
      },
      Message: {
        Subject: {
          Data: params.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: htmlWithTracking,
            Charset: "UTF-8",
          },
        },
      },
    });

    const response = await sesClient.send(command);
    return { success: true, messageId: response.MessageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendEmailViaSMTP(config: SMTPConfig, params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });

    const htmlWithTracking = injectTracking(params.htmlBody, params.trackingToken, params.baseUrl);

    const result = await transporter.sendMail({
      from: `${params.fromName} <${params.fromEmail}>`,
      to: params.to,
      subject: params.subject,
      html: htmlWithTracking,
    });

    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function injectTracking(htmlBody: string, trackingToken: string, baseUrl: string): string {
  const trackingPixel = `<img src="${baseUrl}/t/open/${trackingToken}" width="1" height="1" style="display:none" alt="" />`;
  
  let htmlWithTracking = htmlBody;
  const linkRegex = /href="(https?:\/\/[^"]+)"/g;
  htmlWithTracking = htmlWithTracking.replace(linkRegex, (match, url) => {
    const encodedUrl = encodeURIComponent(url);
    return `href="${baseUrl}/t/click/${trackingToken}?url=${encodedUrl}"`;
  });
  
  if (htmlWithTracking.includes("</body>")) {
    htmlWithTracking = htmlWithTracking.replace("</body>", `${trackingPixel}</body>`);
  } else {
    htmlWithTracking += trackingPixel;
  }

  return htmlWithTracking;
}

export async function sendEmail(
  protocol: 'api' | 'smtp',
  config: SESConfig | SMTPConfig,
  params: SendEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (protocol === 'smtp') {
    return sendEmailViaSMTP(config as SMTPConfig, params);
  }
  return sendEmailViaAPI(config as SESConfig, params);
}

export function generateTrackingToken(): string {
  return uuidv4();
}

// Reusable sender factory for high-throughput campaign sending
// Creates client once and returns a closure that sends without rebuilding the client
export type EmailSender = (params: SendEmailParams) => Promise<{ success: boolean; messageId?: string; error?: string }>;

export function createApiSender(config: SESConfig): EmailSender {
  // Create SES client once with HTTP keep-alive for connection reuse
  // This eliminates TLS handshake overhead (~100-200ms) per email
  const sesClient = new SESClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestHandler: httpHandler,
    maxAttempts: 3,
  });

  return async (params: SendEmailParams) => {
    try {
      const htmlWithTracking = injectTracking(params.htmlBody, params.trackingToken, params.baseUrl);

      const command = new SendEmailCommand({
        Source: `${params.fromName} <${params.fromEmail}>`,
        Destination: {
          ToAddresses: [params.to],
        },
        Message: {
          Subject: {
            Data: params.subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: htmlWithTracking,
              Charset: "UTF-8",
            },
          },
        },
      });

      const response = await sesClient.send(command);
      return { success: true, messageId: response.MessageId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };
}

export function createSmtpSender(config: SMTPConfig): EmailSender {
  // Create SMTP transporter once - connection pooling handles reuse
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
    pool: true, // Use connection pooling for high throughput
    maxConnections: 10, // Increased from 5 for higher throughput
    maxMessages: 500, // Messages per connection before reconnecting
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });

  return async (params: SendEmailParams) => {
    try {
      const htmlWithTracking = injectTracking(params.htmlBody, params.trackingToken, params.baseUrl);

      const result = await transporter.sendMail({
        from: `${params.fromName} <${params.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: htmlWithTracking,
      });

      return { success: true, messageId: result.messageId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };
}

export function createEmailSender(
  protocol: 'api' | 'smtp',
  config: SESConfig | SMTPConfig
): EmailSender {
  if (protocol === 'smtp') {
    return createSmtpSender(config as SMTPConfig);
  }
  return createApiSender(config as SESConfig);
}

export interface TransactionalEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  fromEmail: string;
  fromName: string;
}

export async function sendTransactionalEmailViaAPI(
  config: SESConfig,
  params: TransactionalEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    const command = new SendEmailCommand({
      Source: `${params.fromName} <${params.fromEmail}>`,
      Destination: {
        ToAddresses: [params.to],
      },
      Message: {
        Subject: {
          Data: params.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: params.htmlBody,
            Charset: "UTF-8",
          },
        },
      },
    });

    const response = await sesClient.send(command);
    return { success: true, messageId: response.MessageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendTransactionalEmailViaSMTP(
  config: SMTPConfig,
  params: TransactionalEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.password,
      },
    });

    const result = await transporter.sendMail({
      from: `${params.fromName} <${params.fromEmail}>`,
      to: params.to,
      subject: params.subject,
      html: params.htmlBody,
    });

    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendTransactionalEmail(
  protocol: 'api' | 'smtp',
  config: SESConfig | SMTPConfig,
  params: TransactionalEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (protocol === 'smtp') {
    return sendTransactionalEmailViaSMTP(config as SMTPConfig, params);
  }
  return sendTransactionalEmailViaAPI(config as SESConfig, params);
}

export function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }
  return password;
}

export function generateWelcomeEmailHtml(name: string, email: string, password: string, loginUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #4338ca; margin-bottom: 24px; font-size: 24px;">Welcome to SmartBridge Campaigns!</h1>
    
    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
      Hi ${name},
    </p>
    
    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
      Your account has been created. Here are your login credentials:
    </p>
    
    <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 12px 0; color: #374151;">
        <strong>Email:</strong> ${email}
      </p>
      <p style="margin: 0; color: #374151;">
        <strong>Password:</strong> <code style="background-color: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code>
      </p>
    </div>
    
    <p style="color: #dc2626; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
      <strong>Important:</strong> Please change your password after your first login for security purposes.
    </p>
    
    <a href="${loginUrl}" style="display: inline-block; background-color: #4338ca; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
      Login to SmartBridge Campaigns
    </a>
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      If you have any questions, please contact your administrator.
    </p>
  </div>
</body>
</html>
  `.trim();
}
