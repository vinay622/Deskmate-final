import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// GET: Unresolved ticket counts for the admin's college (notification bell)
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const { data: tickets, error } = await supabase
      .from('escalation_tickets')
      .select('status')
      .eq('college_name', locals.collegeName);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows = tickets ?? [];
    return new Response(
      JSON.stringify({
        ok: true,
        total_tickets: rows.length,
        open_count: rows.filter((t) => t.status === 'open').length,
        in_progress_count: rows.filter((t) => t.status === 'in_progress').length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
