// ─── Email Delivery Service (Gmail SMTP via Nodemailer + Resend Fallback) ───
// Supports Gmail SMTP (or any standard SMTP server) and Resend API.
// Gracefully skips and logs if credentials are not configured.

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

interface ApprovalEmailOptions {
  toEmail: string;
  studentName?: string | null;
  collegeName?: string | null;
  siteUrl?: string;
}

interface RejectionEmailOptions {
  toEmail: string;
  studentName?: string | null;
  collegeName?: string | null;
}

/**
 * Reads a configuration variable with multi-source fallback:
 * 1. import.meta.env (Vite/Astro standard)
 * 2. process.env (Node runtime)
 * 3. Live .env file parse on disk (ensures live credentials without requiring server restart)
 */
function readConfigValue(key: string): string | undefined {
  const fromMeta = import.meta.env[key];
  if (fromMeta && String(fromMeta).trim().length > 0) return String(fromMeta).trim();

  if (typeof process !== 'undefined' && process.env?.[key]) {
    const fromProc = process.env[key];
    if (fromProc && String(fromProc).trim().length > 0) return String(fromProc).trim();
  }

  try {
    const candidates = [
      path.resolve('.env'),
      path.resolve(process.cwd(), '.env'),
      'C:\\keep\\DeskMate\\DeskMate 2.0\\Positivus\\.env',
      'C:\\Users\\vinay\\projects\\DeskMate\\DeskMate 2.0\\Positivus\\.env',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith(key + '=')) {
            const val = trimmed.slice(key.length + 1).trim();
            if (val.length > 0) return val;
          }
        }
      }
    }
  } catch {}

  return undefined;
}

/**
 * Creates a reusable Nodemailer transport for Gmail SMTP or custom SMTP.
 */
function getSmtpTransporter() {
  const user = readConfigValue('SMTP_USER') || readConfigValue('GMAIL_USER');
  const pass = readConfigValue('SMTP_PASS') || readConfigValue('GMAIL_APP_PASSWORD');
  const host = readConfigValue('SMTP_HOST');
  const port = Number(readConfigValue('SMTP_PORT')) || 465;

  if (!user || !pass) {
    return null;
  }

  const cleanPass = pass.replace(/\s+/g, '');

  // If host is custom and not Gmail, use custom host/port
  if (host && !host.includes('gmail')) {
    const customPort = port || 587;
    return {
      transporter: nodemailer.createTransport({
        host,
        port: customPort,
        secure: customPort === 465,
        auth: {
          user,
          pass: cleanPass,
        },
      }),
      fromEmail: user,
    };
  }

  // Gmail SMTP: Use dedicated 'gmail' service for seamless SSL/TLS connection
  return {
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass: cleanPass,
      },
    }),
    fromEmail: user,
  };
}

/**
 * Sends a welcome & approval notification email to a student when their
 * access request is approved by an administrator or staff member.
 */
export async function sendStudentApprovalEmail(options: ApprovalEmailOptions): Promise<boolean> {
  const { toEmail, studentName, collegeName, siteUrl } = options;
  if (!toEmail) return false;

  const displayName = studentName?.trim() || 'Student';
  const college = collegeName?.trim() || 'your college';
  const loginUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/login` : 'https://deskmate.app/login';
  const fromName = (import.meta.env.SMTP_FROM_NAME as string | undefined) || 'DeskMate';
  const subject = `🎉 Welcome to DeskMate! Your access for ${college} has been approved`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #191a23;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f5f7; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #191a23; padding: 32px 36px; text-align: left;">
              <span style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                Desk<span style="color: #b9ff66;">Mate</span>
              </span>
              <div style="margin-top: 16px;">
                <span style="display: inline-block; background-color: rgba(185, 255, 102, 0.15); color: #b9ff66; border: 1px solid rgba(185, 255, 102, 0.3); font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Access Granted
                </span>
              </div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 12px 0 0 0; line-height: 1.3;">
                Your account is ready!
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <p style="font-size: 15px; line-height: 1.6; color: #2d3139; margin: 0 0 16px 0;">
                Hi <strong>${displayName}</strong>,
              </p>
              <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 24px 0;">
                Great news! Your access request for <strong>${college}</strong> on DeskMate has been reviewed and <strong style="color: #059669;">approved</strong> by the college administration.
              </p>

              <!-- Features Box -->
              <table role="presentation" width="100%" style="background-color: #f9fafb; border: 1px solid #eef0f2; border-radius: 14px; padding: 18px 20px; margin-bottom: 28px;" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <p style="font-size: 13px; font-weight: 600; color: #191a23; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                      What you can do with DeskMate:
                    </p>
                    <ul style="margin: 0; padding-left: 18px; color: #4b5563; font-size: 14px; line-height: 1.6;">
                      <li style="margin-bottom: 6px;">Ask questions and get instant answers from official college regulations, syllabus, and notices.</li>
                      <li style="margin-bottom: 6px;">Query exam schedules, fee details, and scholarship announcements.</li>
                      <li>Contact department staff and escalate urgent queries.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 12px; background-color: #191a23;">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 600; color: #b9ff66; text-decoration: none; border-radius: 12px; background-color: #191a23;">
                      Log In to DeskMate &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin: 0;">
                If the button above doesn't work, copy and paste this link into your browser:<br>
                <a href="${loginUrl}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0 0 4px 0;">
                This email was sent to <strong>${toEmail}</strong> regarding your DeskMate account for ${college}.
              </p>
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                &copy; ${new Date().getFullYear()} DeskMate. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const textContent = `
Hi ${displayName},

Great news! Your access request for ${college} on DeskMate has been reviewed and approved by the college administration.

You can now log in to the portal and start exploring:
- Instant answers from official college regulations, syllabus, and notices
- Exam schedules, fee details, and scholarship announcements
- Connect with department staff

Log in to your account here:
${loginUrl}

— The DeskMate Team & ${college} Administration
  `.trim();

  // ─── 1. Primary: Dispatch via Gmail SMTP if configured ───
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      await smtp.transporter.sendMail({
        from: `"${fromName}" <${smtp.fromEmail}>`,
        to: toEmail,
        subject,
        html: htmlContent,
        text: textContent,
      });
      console.info(`[email:smtp] Approval email delivered to ${toEmail} via Gmail SMTP.`);
      return true;
    } catch (err: any) {
      console.error('[email:smtp] Failed to send approval email via Gmail SMTP:', err?.message || err);
      // Fall through to Resend fallback if available
    }
  }

  // ─── 2. Secondary: Fallback to Resend API if configured ───
  const resendApiKey = import.meta.env.RESEND_API_KEY as string | undefined;
  if (resendApiKey) {
    const resendFrom = (import.meta.env.RESEND_FROM_EMAIL as string | undefined) || 'DeskMate <onboarding@resend.dev>';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [toEmail],
          subject,
          html: htmlContent,
          text: textContent,
        }),
      });

      if (res.ok) {
        console.info(`[email:resend] Approval email delivered to ${toEmail} via Resend.`);
        return true;
      }
      const errBody = await res.text().catch(() => '');
      console.error('[email:resend] Resend send error:', res.status, errBody);
    } catch (err: any) {
      console.error('[email:resend] Resend exception:', err?.message || err);
    }
  }

  if (!smtp && !resendApiKey) {
    console.info('[email] Neither SMTP credentials (SMTP_USER/SMTP_PASS) nor RESEND_API_KEY are configured.');
  }

  return false;
}

/**
 * Sends a notification email to a student if their access request is rejected.
 */
export async function sendStudentRejectionEmail(options: RejectionEmailOptions): Promise<boolean> {
  const { toEmail, studentName, collegeName } = options;
  if (!toEmail) return false;

  const displayName = studentName?.trim() || 'Student';
  const college = collegeName?.trim() || 'your college';
  const fromName = (import.meta.env.SMTP_FROM_NAME as string | undefined) || 'DeskMate';
  const subject = `Update on your DeskMate access request for ${college}`;

  const textContent = `
Hi ${displayName},

Your student access request for ${college} on DeskMate was not approved at this time.

If you believe this was in error or need access, please contact your college administrator or department office.

— The DeskMate Team & ${college} Administration
  `.trim();

  // Try SMTP first
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      await smtp.transporter.sendMail({
        from: `"${fromName}" <${smtp.fromEmail}>`,
        to: toEmail,
        subject,
        text: textContent,
      });
      return true;
    } catch (err) {
      console.error('[email:smtp] Failed to send rejection email:', err);
    }
  }

  // Fallback to Resend
  const resendApiKey = import.meta.env.RESEND_API_KEY as string | undefined;
  if (resendApiKey) {
    const resendFrom = (import.meta.env.RESEND_FROM_EMAIL as string | undefined) || 'DeskMate <onboarding@resend.dev>';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [toEmail],
          subject,
          text: textContent,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error('[email:resend] Exception sending rejection email:', err);
    }
  }

  return false;
}
