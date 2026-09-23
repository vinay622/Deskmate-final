import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// GET: List all staff members for the admin's college
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const { data: staff, error } = await supabase
      .from('staff_members')
      .select('id, name, role, department, email, phone, whatsapp, office_location, office_hours, languages, query_categories, urgency_level, status, created_at')
      .eq('college_name', locals.collegeName)
      .order('name');

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, staff }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Create new staff member
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();
    const {
      name, department, role, query_categories, email, phone, whatsapp,
      office_location, office_hours, languages, urgency_level, status
    } = body;

    if (!name || !department || !query_categories || !Array.isArray(query_categories)) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Name, department, and query categories are required. Categories must be an array.'
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!languages || !Array.isArray(languages) || languages.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'At least one language must be selected.'
      }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: newStaff, error } = await supabase
      .from('staff_members')
      .insert({
        name: name.trim(),
        department: department.trim(),
        role: role?.trim() || null,
        query_categories,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        whatsapp: whatsapp?.trim() || null,
        office_location: office_location?.trim() || null,
        office_hours: office_hours?.trim() || null,
        languages,
        urgency_level: urgency_level || 'normal',
        status: status || 'active',
        college_name: locals.collegeName,
      })
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, staff: newStaff }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
