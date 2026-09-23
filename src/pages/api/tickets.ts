import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

// GET: The signed-in student's own escalation tickets (newest first)
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const { data: tickets, error } = await supabase
      .from('escalation_tickets')
      .select('id, query, category, staff_name, status, resolution_note, created_at, updated_at')
      .eq('student_id', locals.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, tickets: tickets ?? [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Student raises an escalation ticket (only after confirming in chat)
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();
    const { query, category, staff_name } = body;

    if (!query || !String(query).trim()) {
      return new Response(JSON.stringify({ ok: false, error: 'Query is required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: ticket, error } = await supabase
      .from('escalation_tickets')
      .insert({
        college_name: locals.collegeName ?? '',
        student_id: locals.user.id,
        student_name: locals.userName ?? locals.user.email ?? 'Student',
        query: String(query).trim(),
        category: category || null,
        staff_name: staff_name || null,
      })
      .select('id')
      .single();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: ticket.id }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
