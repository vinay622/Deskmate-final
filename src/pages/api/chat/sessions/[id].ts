import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';

// PATCH /api/chat/sessions/:id — rename session
export const PATCH: APIRoute = async ({ request, cookies, locals, params }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = params.id as string;
  const body = await request.json();
  const title = String(body.title ?? '').trim().slice(0, 120);

  if (!title) {
    return new Response(JSON.stringify({ ok: false, error: 'Title cannot be empty' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .update({ title })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, title, created_at')
    .single();

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, session }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// DELETE /api/chat/sessions/:id — delete session and all its messages
export const DELETE: APIRoute = async ({ request, cookies, locals, params }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = params.id as string;
  const supabase = createSupabaseServerClient(request, cookies);
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
