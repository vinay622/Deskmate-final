import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

// GET: Active announcements for the signed-in user's college (students + admins)
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const nowIso = new Date().toISOString();
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select('id, title, body, category, pinned, created_by_name, created_at, notify_students')
      .eq('college_name', locals.collegeName)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, announcements: announcements ?? [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
