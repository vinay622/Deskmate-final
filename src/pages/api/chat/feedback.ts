import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// POST /api/chat/feedback — student rates a bot answer (up/down + optional reason)
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const queryLogId = body.queryLogId as string | undefined;
    const feedback = body.feedback as string | undefined;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

    if (!queryLogId) {
      return new Response(JSON.stringify({ ok: false, error: 'queryLogId is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (feedback !== 'up' && feedback !== 'down') {
      return new Response(JSON.stringify({ ok: false, error: 'feedback must be "up" or "down"' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseServerClient(request, cookies);
    const { error } = await supabase
      .from('query_logs')
      .update({ feedback, feedback_reason: reason })
      .eq('id', queryLogId)
      .eq('user_id', user.id);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
