import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  // Only the college admin can manage staff accounts
  if (!locals.user || locals.userRole !== 'admin') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized. Admin privileges required.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { id } = params;
  if (!id) {
    return new Response(
      JSON.stringify({ ok: false, error: 'User ID is required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Prevent self-deactivation
  if (id === locals.user.id) {
    return new Response(
      JSON.stringify({ ok: false, error: 'You cannot deactivate your own admin account.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid JSON body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (typeof body.is_active !== 'boolean') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Field "is_active" (boolean) is required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createSupabaseServerClient(request, cookies);

  // Verify target user belongs to admin's college and is not another admin
  const { data: targetUser, error: fetchError } = await supabase
    .from('profiles')
    .select('id, college_name, role, full_name')
    .eq('id', id)
    .single();

  if (fetchError || !targetUser) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Account not found.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (targetUser.college_name !== locals.collegeName) {
    return new Response(
      JSON.stringify({ ok: false, error: 'This account does not belong to your college.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const updatePayload: Record<string, any> = {
    is_active: body.is_active,
    updated_at: new Date().toISOString(),
  };

  // If this target account still had 'admin' from before, normalize it to 'staff'
  if (targetUser.role === 'admin') {
    updatePayload.role = 'staff';
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', id);

  if (updateError) {
    return new Response(
      JSON.stringify({ ok: false, error: updateError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      id,
      is_active: body.is_active,
      message: body.is_active ? 'Account reactivated successfully.' : 'Account deactivated successfully.',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
