import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';

const VALID_STATUSES = ['open', 'in_progress', 'resolved'];

// POST: Update ticket status / resolution note
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
    const { status, resolution_note } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'A valid status (open, in_progress, resolved) is required.',
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const update: Record<string, unknown> = { status };
    if (typeof resolution_note === 'string' && resolution_note.trim()) {
      update.resolution_note = resolution_note.trim();
    }

    const { error } = await supabase
      .from('escalation_tickets')
      .update(update)
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
