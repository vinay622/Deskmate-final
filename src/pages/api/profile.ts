import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

// GET: The signed-in user's own profile fields
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('degree_program, department, year, hosteller')
      .eq('id', locals.user.id)
      .single();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, profile }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Update the signed-in user's own profile fields
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();

    const degreeProgram = typeof body.degree_program === 'string' ? body.degree_program.trim() : '';
    const department = typeof body.department === 'string' ? body.department.trim() : '';

    let year: number | null = null;
    if (body.year !== null && body.year !== undefined && body.year !== '') {
      const parsed = Number(body.year);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        return new Response(JSON.stringify({ ok: false, error: 'Year must be between 1 and 5.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      year = parsed;
    }

    let hosteller: boolean | null = null;
    if (body.hosteller === true || body.hosteller === 'true') hosteller = true;
    else if (body.hosteller === false || body.hosteller === 'false') hosteller = false;

    const { error } = await supabase
      .from('profiles')
      .update({
        degree_program: degreeProgram || null,
        department: department || null,
        year,
        hosteller,
      })
      .eq('id', locals.user.id);

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
