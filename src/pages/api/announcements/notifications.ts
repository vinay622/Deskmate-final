import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

/**
 * GET /api/announcements/notifications
 * Returns the college's active notify-students announcements that the
 * current user hasn't read yet, plus a total unread count.
 */
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);
  const collegeName = locals.collegeName ?? '';

  try {
    // Active, non-expired, notification-worthy announcements for this college
    const { data: announcements, error: annErr } = await supabase
      .from('announcements')
      .select('id, title, body, category, pinned, created_at')
      .eq('college_name', collegeName)
      .eq('notify_students', true)
      .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (annErr) {
      return new Response(JSON.stringify({ ok: false, error: annErr.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Which of them has this user already read?
    const { data: reads, error: readErr } = await supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('user_id', locals.user.id);

    if (readErr) {
      return new Response(JSON.stringify({ ok: false, error: readErr.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const readIds = new Set((reads ?? []).map((r) => r.announcement_id));
    const unread = (announcements ?? []).filter((a) => !readIds.has(a.id));

    return new Response(JSON.stringify({
      ok: true,
      unread,
      count: unread.length,
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * POST /api/announcements/notifications
 * Marks the given announcement ids as read for the current user.
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
      return new Response(JSON.stringify({ ok: false, error: 'ids must be a string array' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows = (ids as string[]).map((id) => ({
      announcement_id: id,
      user_id: locals.user!.id,
      college_name: locals.collegeName ?? '',
    }));

    const { error } = await supabase
      .from('announcement_reads')
      .upsert(rows, { onConflict: 'announcement_id,user_id' });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, marked: rows.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
