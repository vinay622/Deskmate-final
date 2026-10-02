import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// GET: Fetch allowed domains for the current college
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || (locals.userRole !== 'admin' && locals.userRole !== 'staff')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);
  const { data: domains, error } = await supabase
    .from('college_domains')
    .select('id, domain, created_at')
    .eq('college_name', locals.collegeName)
    .order('created_at', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, domains: domains ?? [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// POST: Add a new allowed domain for the college (Admin-only)
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Only college administrators can manage email domains.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!locals.collegeName) {
    return new Response(
      JSON.stringify({ ok: false, error: 'No college associated with this administrator.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    let rawDomain = String(body.domain ?? '').trim().toLowerCase();

    // Strip leading @ if entered (e.g., "@gmail.com" -> "gmail.com")
    if (rawDomain.startsWith('@')) {
      rawDomain = rawDomain.slice(1).trim();
    }

    // Domain validation: must contain dot, no spaces, no slashes, min length 3
    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
    if (!rawDomain || !domainRegex.test(rawDomain)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Please enter a valid domain (e.g. gmail.com, cbit.ac.in, or outlook.com).',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseServerClient(request, cookies);

    // Check if already allowed for this college
    const { data: existing } = await supabase
      .from('college_domains')
      .select('id')
      .eq('college_name', locals.collegeName)
      .eq('domain', rawDomain)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `The domain "${rawDomain}" is already allowed for ${locals.collegeName}.`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from('college_domains')
      .insert({
        college_name: locals.collegeName,
        domain: rawDomain,
      })
      .select('id, domain')
      .single();

    if (insertError) {
      console.error('[Admin Domains API] Insert error:', insertError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: insertError.message || 'Could not add domain. Please check database permissions.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        domain: inserted,
        message: `Successfully added ${rawDomain} to allowed student domains.`,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || 'Invalid request body.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// DELETE: Remove an allowed domain for the college (Admin-only)
export const DELETE: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Only college administrators can manage email domains.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    let rawDomain = String(body.domain ?? '').trim().toLowerCase();
    if (rawDomain.startsWith('@')) {
      rawDomain = rawDomain.slice(1).trim();
    }

    if (!rawDomain) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Domain is required for removal.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseServerClient(request, cookies);

    const { error: deleteError } = await supabase
      .from('college_domains')
      .delete()
      .eq('college_name', locals.collegeName)
      .eq('domain', rawDomain);

    if (deleteError) {
      console.error('[Admin Domains API] Delete error:', deleteError);
      return new Response(
        JSON.stringify({ ok: false, error: deleteError.message || 'Could not remove domain.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Successfully removed ${rawDomain} from allowed student domains.`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || 'Invalid request body.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
