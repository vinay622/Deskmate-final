import type { APIRoute } from 'astro';
import { getSmtpTransporter } from '../../../lib/email';

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user || (locals.userRole !== 'admin' && locals.userRole !== 'staff')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized. Admin or staff privileges required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const sendTest = url.searchParams.get('send') === 'true';
  const targetEmail = url.searchParams.get('to') || locals.user.email;

  const user = (process.env.SMTP_USER || import.meta.env.SMTP_USER || process.env.GMAIL_USER || import.meta.env.GMAIL_USER) as string | undefined;
  const pass = (process.env.SMTP_PASS || import.meta.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || import.meta.env.GMAIL_APP_PASSWORD) as string | undefined;
  const resend = (process.env.RESEND_API_KEY || import.meta.env.RESEND_API_KEY) as string | undefined;

  const diagnostics = {
    hasSmtpUser: Boolean(user && user.trim().length > 0),
    smtpUser: user ? `${user.slice(0, 3)}***@${user.split('@')[1] || 'domain'}` : null,
    hasSmtpPass: Boolean(pass && pass.trim().length > 0),
    smtpPassLength: pass ? pass.replace(/\s+/g, '').length : 0,
    hasResendApiKey: Boolean(resend && resend.trim().length > 0),
  };

  if (!diagnostics.hasSmtpUser || !diagnostics.hasSmtpPass) {
    return new Response(
      JSON.stringify({
        ok: false,
        diagnostics,
        error:
          'SMTP credentials are missing on this server environment. If deployed on Vercel, navigate to Vercel Dashboard -> Project Settings -> Environment Variables, add SMTP_USER and SMTP_PASS, and trigger a Redeploy.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const smtp = getSmtpTransporter();
  if (!smtp) {
    return new Response(
      JSON.stringify({
        ok: false,
        diagnostics,
        error: 'Failed to initialize SMTP transporter.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Verify connection with Gmail SMTP
    await smtp.transporter.verify();

    let emailSent = false;
    let messageId: string | null = null;

    // 2. Optionally dispatch a real test message
    if (sendTest && targetEmail) {
      const info = await smtp.transporter.sendMail({
        from: `"DeskMate Diagnostic" <${smtp.fromEmail}>`,
        to: targetEmail,
        subject: '🧪 DeskMate SMTP Delivery Verification Test',
        text: 'This is a test notification verifying that Gmail SMTP delivery is working on your deployed DeskMate instance.',
        html: `
          <div style="font-family: sans-serif; padding: 24px; background: #191a23; color: #fff; border-radius: 12px;">
            <h2 style="color: #b9ff66; margin: 0 0 10px 0;">🎉 DeskMate SMTP Live Test Successful</h2>
            <p style="font-size: 14px; line-height: 1.5; color: #e5e7eb;">Your Gmail SMTP connection is operational on the server!</p>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">Sent to ${targetEmail} from ${smtp.fromEmail}</p>
          </div>
        `,
      });
      emailSent = true;
      messageId = info.messageId;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        diagnostics,
        message: 'Gmail SMTP connection verified successfully!',
        emailSent,
        messageId,
        sentTo: emailSent ? targetEmail : null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        diagnostics,
        error: `Gmail SMTP connection failed: ${err?.message || err}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
