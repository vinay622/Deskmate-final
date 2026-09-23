import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// GET: Find staff members by category for escalation
export const GET: APIRoute = async ({ request, cookies, locals, url }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const category = url.searchParams.get('category');
  const language = url.searchParams.get('language');
  const urgent = url.searchParams.get('urgent') === 'true';

  if (!category) {
    return new Response(JSON.stringify({ ok: false, error: 'Category parameter is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    let query = supabase
      .from('staff_members')
      .select('name, department, role, email, phone, whatsapp, office_location, office_hours, languages, urgency_level')
      .eq('college_name', locals.collegeName)
      .eq('status', 'active')
      .contains('query_categories', [category.toLowerCase()]);

    // Language-based filtering
    if (language && language !== 'english') {
      query = query.contains('languages', [language.toLowerCase()]);
    }

    // Urgency-based filtering
    if (urgent) {
      query = query.in('urgency_level', ['urgent', 'emergency']);
    }

    const { data: staff, error } = await query
      .order('urgency_level', { ascending: false })
      .order('name')
      .limit(3);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, staff, category }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};