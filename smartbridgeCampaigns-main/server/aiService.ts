import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Format date in IST (Indian Standard Time, UTC+5:30)
function formatDateIST(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export interface AITemplateResult {
  correctedContent: string;
  htmlTemplate: string;
  improvements: string[];
}

export async function generateEmailTemplate(draftContent: string): Promise<AITemplateResult> {
  const systemPrompt = `You are an expert email copywriter and HTML email developer. 
Your task is to:
1. Review the email draft for grammar, spelling, punctuation, and clarity mistakes
2. Correct any errors found
3. Generate a professional, responsive HTML email template

Guidelines for the HTML template:
- Use inline CSS styles (email clients don't support external stylesheets)
- Make it responsive and mobile-friendly
- Use a clean, professional design with good typography
- Include a max-width container (600px)
- Use web-safe fonts with fallbacks
- Keep the design simple and focused on readability
- Use a neutral color scheme unless the content suggests otherwise
- Add proper spacing and padding

Return your response as JSON with this exact structure:
{
  "correctedContent": "The corrected plain text version of the email",
  "htmlTemplate": "The complete HTML email template with the corrected content",
  "improvements": ["List of improvements/corrections made"]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            correctedContent: { type: "string" },
            htmlTemplate: { type: "string" },
            improvements: { 
              type: "array",
              items: { type: "string" }
            },
          },
          required: ["correctedContent", "htmlTemplate", "improvements"],
        },
      },
      contents: `Please review and transform this email draft into a professional HTML template:\n\n${draftContent}`,
    });

    const rawJson = response.text;
    
    if (rawJson) {
      const data: AITemplateResult = JSON.parse(rawJson);
      return data;
    } else {
      throw new Error("Empty response from AI model");
    }
  } catch (error: any) {
    console.error("AI template generation error:", error);
    throw new Error(`Failed to generate email template: ${error.message}`);
  }
}

export function generateCampaignAlertEmailHtml(
  alertType: 'start' | 'completion',
  campaignName: string,
  segmentName: string,
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
): string {
  const isStart = alertType === 'start';
  const title = isStart ? 'Campaign Started' : 'Campaign Completed';
  const statusColor = stats.status === 'completed' ? '#10b981' : stats.status === 'failed' ? '#ef4444' : '#3b82f6';
  const totalFailed = (stats.failedCount || 0) + (stats.bouncedCount || 0);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; padding: 8px 16px; background-color: ${statusColor}; color: white; border-radius: 20px; font-size: 14px; font-weight: 500;">
        ${title}
      </div>
    </div>
    
    <h1 style="color: #1f2937; margin-bottom: 8px; font-size: 24px; text-align: center;">${campaignName}</h1>
    <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 32px;">Segment: ${segmentName}</p>
    
    <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        ${isStart ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Total Recipients</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${stats.totalRecipients?.toLocaleString() || 0}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Started At (IST)</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${stats.startedAt ? formatDateIST(stats.startedAt) : 'N/A'}</td>
        </tr>
        ` : `
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Status</td>
          <td style="padding: 8px 0; color: ${statusColor}; font-size: 14px; font-weight: 600; text-align: right;">${stats.status?.toUpperCase() || 'UNKNOWN'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Emails Sent</td>
          <td style="padding: 8px 0; color: #10b981; font-size: 14px; font-weight: 600; text-align: right;">${stats.sentCount?.toLocaleString() || 0}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Send Failures</td>
          <td style="padding: 8px 0; color: ${(stats.failedCount || 0) > 0 ? '#ef4444' : '#6b7280'}; font-size: 14px; font-weight: 600; text-align: right;">${stats.failedCount?.toLocaleString() || 0}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Bounced</td>
          <td style="padding: 8px 0; color: ${(stats.bouncedCount || 0) > 0 ? '#f59e0b' : '#6b7280'}; font-size: 14px; font-weight: 600; text-align: right;">${stats.bouncedCount?.toLocaleString() || 0}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Complaints</td>
          <td style="padding: 8px 0; color: ${(stats.complaintsCount || 0) > 0 ? '#ef4444' : '#6b7280'}; font-size: 14px; font-weight: 600; text-align: right;">${stats.complaintsCount?.toLocaleString() || 0}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Completed At (IST)</td>
          <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${stats.completedAt ? formatDateIST(stats.completedAt) : 'N/A'}</td>
        </tr>
        `}
      </table>
    </div>
    
    <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
      This is an automated notification from SmartBridge Campaigns.
    </p>
  </div>
</body>
</html>
  `.trim();
}
