import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';

const VALID_STATUSES = ['approved', 'rejected'];

// POST: Approve or reject a student of the admin's college
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
    const status = body.status as string | undefined;

    if (!status || !VALID_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ ok: false, error: 'status must be "approved" or "rejected"' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ approval_status: status })
      .eq('id', id)
      .eq('college_name', locals.collegeName)
      .eq('role', 'student');

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
