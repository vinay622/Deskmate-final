import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// GET /api/chat/sessions — list authenticated user's sessions
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);
  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('id, title, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, sessions: sessions ?? [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// POST /api/chat/sessions — create a new session
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const title = ((body.title as string) ?? 'New Chat').slice(0, 120);

  const supabase = createSupabaseServerClient(request, cookies);
  const { data: session, error } = await supabase
    .from('chat_sessions')
    .insert({ user_id: user.id, title })
    .select('id, title, created_at')
    .single();

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, session }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
