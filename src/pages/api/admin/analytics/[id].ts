import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';

// POST: Mark a query log as reviewed (knowledge-gap triage)
export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = params.id as string;
  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();
    const reviewed = body.reviewed !== false;

    const { error } = await supabase
      .from('query_logs')
      .update({ reviewed })
      .eq('id', id)
      .eq('college_name', locals.collegeName);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
