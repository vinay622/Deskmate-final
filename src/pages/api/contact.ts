import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

// ─── Per-IP rate limit (in-memory sliding window; approximate across cold starts) ───
const CONTACT_MAX = 5;
const CONTACT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const contactBuckets = new Map<string, number[]>();

function checkContactRateLimit(ip: string): boolean {
  const now = Date.now();

  if (contactBuckets.size > 5000) {
    for (const [key, times] of contactBuckets) {
      if (times.every((t) => now - t >= CONTACT_WINDOW_MS)) contactBuckets.delete(key);
    }
  }

  const hits = (contactBuckets.get(ip) ?? []).filter((t) => now - t < CONTACT_WINDOW_MS);
  if (hits.length >= CONTACT_MAX) {
    contactBuckets.set(ip, hits);
    return false;
  }
  hits.push(now);
  contactBuckets.set(ip, hits);
  return true;
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Optional email delivery via Resend free tier (plain fetch — no SDK).
// Set RESEND_API_KEY + CONTACT_EMAIL to enable; without them the
// contact_messages DB row is the only (and durable) record.
async function sendEmail(name: string, email: string, topic: string, message: string): Promise<boolean> {
  const apiKey = import.meta.env.RESEND_API_KEY as string | undefined;
  const to = import.meta.env.CONTACT_EMAIL as string | undefined;
  if (!apiKey || !to) return false;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'DeskMate Contact <onboarding@resend.dev>',
        to: [to],
        reply_to: email,
        subject: `[DeskMate] ${topic === 'partnership' ? 'Partnership' : 'General'} inquiry from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`,
      }),
    });
    if (!res.ok) {
      console.error('[contact] Resend send failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[contact] Resend send error:', err?.message || err);
    return false;
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  // Honeypot: real users never fill this hidden field
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (body.website) {
    // Pretend success so bots don't learn anything
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!checkContactRateLimit(clientIp(request))) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Too many messages. Please try again later.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  const topic = body.topic === 'partnership' ? 'partnership' : 'general';

  if (!name || !message) {
    return new Response(JSON.stringify({ ok: false, error: 'Name and message are required.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ ok: false, error: 'A valid email is required.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createSupabaseServerClient(request, cookies);
    const { error: insertErr } = await supabase
      .from('contact_messages')
      .insert({ name, email, topic, message });

    if (insertErr) {
      console.error('[contact] DB insert failed:', insertErr.message);
      return new Response(JSON.stringify({ ok: false, error: 'Could not send your message. Please try again.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    await sendEmail(name, email, topic, message);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[contact] Unexpected error:', err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: 'Something went wrong. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
