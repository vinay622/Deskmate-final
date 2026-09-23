import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';

export const DELETE: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = params.id as string;
  const supabase = createSupabaseServerClient(request, cookies);
  const { error } = await supabase.from('staff_members').delete().eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
