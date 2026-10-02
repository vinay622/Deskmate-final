import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const firstName = String(formData.get('first_name') ?? '').trim();
  const lastName = String(formData.get('last_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const college = String(formData.get('college') ?? '').trim();
  const role = String(formData.get('role') ?? 'student');
  const accessCode = String(formData.get('access_code') ?? '').trim();
  const degreeProgram = String(formData.get('degree_program') ?? '').trim();
  const department = String(formData.get('department') ?? '').trim();
  const yearRaw = String(formData.get('year') ?? '').trim();
  const hostellerRaw = String(formData.get('hosteller') ?? '').trim();

  if (!firstName || !lastName || !email || !password || !college) {
    return new Response(
      JSON.stringify({ ok: false, error: 'All fields are required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (password.length < 8) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Password must be at least 8 characters.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createSupabaseServerClient(request, cookies);

  // Student: email must belong to the chosen college's official domain
  if (role === 'student') {
    const { data: domainRows, error: domainError } = await supabase
      .from('college_domains')
      .select('domain')
      .eq('college_name', college);

    if (domainError) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Could not verify college email domains. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!domainRows || domainRows.length === 0) {
      // Fail closed — a college without configured domains accepts no student signups
      return new Response(
        JSON.stringify({ ok: false, error: 'Signups for this college are not configured yet. Please contact your college administration.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const emailDomain = email.split('@')[1]?.toLowerCase() ?? '';
    const allowed = domainRows.some((r) => r.domain.toLowerCase() === emailDomain);
    if (!allowed) {
      return new Response(
        JSON.stringify({ ok: false, error: `Please use your official ${college} email address.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  let assignedRole = role;

  // Staff / Admin: verify access code first (before creating the user)
  if (role === 'admin' || role === 'staff') {
    if (!accessCode) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Access code is required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: codeRow, error: codeError } = await supabase
      .from('admin_access_codes')
      .select('id, college_name, role')
      .eq('code', accessCode.toUpperCase())
      .single();

    if (codeError || !codeRow) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid access code.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (codeRow.college_name !== college) {
      return new Response(
        JSON.stringify({ ok: false, error: 'This access code does not belong to the selected college.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    assignedRole = codeRow.role || 'staff';

    // 1 Admin per college: check if an admin already exists when using admin access code
    if (assignedRole === 'admin') {
      const { data: existingAdmin } = await supabase
        .from('profiles')
        .select('id')
        .eq('college_name', college)
        .eq('role', 'admin')
        .limit(1);

      if (existingAdmin && existingAdmin.length > 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'An admin account has already been registered for this college. Please sign up using the staff access code or contact your college administrator.'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  // Create auth user, passing assigned role and college as metadata so the
  // handle_new_user trigger creates the profiles row automatically,
  // bypassing RLS (works even when email confirmation is required).
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${firstName} ${lastName}`,
        role: assignedRole,
        college_name: college,
        ...(role === 'student'
          ? {
            degree_program: degreeProgram,
            department: department,
            year: yearRaw,
            hosteller: hostellerRaw,
          }
          : {}),
      },
    },
  });

  if (signUpError || !authData.user) {
    const errorMsg =
      signUpError?.message?.toLowerCase().includes('already registered') ||
      signUpError?.message?.toLowerCase().includes('already exists')
        ? 'An account with this email address already exists. Please log in instead.'
        : (signUpError?.message ?? 'Sign up failed.');

    return new Response(
      JSON.stringify({ ok: false, error: errorMsg }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // If user already exists in auth.users, Supabase returns identities: [] without creating a new user or running the trigger
  const isExistingAuthUser = Boolean(
    authData.user.identities && authData.user.identities.length === 0
  );

  if (isExistingAuthUser) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'An account with this email address already exists. Please log in instead.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Students wait for admin approval; admins and staff go to login with confirmation
  if (assignedRole === 'student') {
    return new Response(
      JSON.stringify({ ok: true, pending: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, redirect: '/login?registered=1' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
