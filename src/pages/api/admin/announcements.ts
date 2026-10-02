import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// POST: Create a new announcement
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || (locals.userRole !== 'admin' && locals.userRole !== 'staff')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();
    const { title, body: content, category, expires_at, pinned, notify_students } = body;

    if (!title || !title.trim() || !content || !content.trim()) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Title and body are required.',
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert({
        college_name: locals.collegeName,
        title: title.trim(),
        body: content.trim(),
        category: category?.trim() || 'General',
        pinned: pinned === true,
        notify_students: notify_students === true,
        expires_at: expires_at || null,
        created_by_name: locals.userName ?? '',
      })
      .select('id')
      .single();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: announcement.id }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
