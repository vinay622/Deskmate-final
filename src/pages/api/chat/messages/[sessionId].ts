import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';

// GET /api/chat/messages/[sessionId] — get all messages for a session
export const GET: APIRoute = async ({ request, cookies, locals, params }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionId = params.sessionId as string;
  const supabase = createSupabaseServerClient(request, cookies);

  // Verify session belongs to this user
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Session not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, meta, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, messages: messages ?? [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// POST /api/chat/messages/[sessionId] — append a message
export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionId = params.sessionId as string;
  const body = await request.json();
  const role = body.role as string;
  const content = body.content as string;
  const meta = body.meta ?? {};

  if (!role || !content) {
    return new Response(JSON.stringify({ ok: false, error: 'role and content are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  // Verify session belongs to this user before inserting
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: 'Session not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, role, content, meta })
    .select('id, role, content, meta, created_at')
    .single();

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, message }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
