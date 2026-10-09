import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase';
import { sendStudentApprovalEmail, sendStudentRejectionEmail } from '../../../../lib/email';

const VALID_STATUSES = ['approved', 'rejected'];

// POST: Approve or reject a student of the admin/staff's college.
export const POST: APIRoute = async ({ request, cookies, locals, params }) => {
  if (!locals.user || (locals.userRole !== 'admin' && locals.userRole !== 'staff')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized. Admin or staff privileges required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = params.id as string;
  if (!id) {
    return new Response(JSON.stringify({ ok: false, error: 'Student ID is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const status = body.status as string | undefined;

    if (!status || !VALID_STATUSES.includes(status)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Status must be either "approved" or "rejected".' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseServerClient(request, cookies);

    // 1. Fetch student profile to verify existence and get email/name for notification
    const { data: targetStudent, error: fetchError } = await supabase
      .from('profiles')
      .select('id, full_name, email, college_name, role, approval_status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return new Response(JSON.stringify({ ok: false, error: `Failed to retrieve student: ${fetchError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!targetStudent) {
      return new Response(JSON.stringify({ ok: false, error: 'Student record not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const callerCollege = (locals.collegeName ?? '').trim().toLowerCase();
    const studentCollege = (targetStudent.college_name ?? '').trim().toLowerCase();

    if (callerCollege && studentCollege && callerCollege !== studentCollege) {
      return new Response(
        JSON.stringify({ ok: false, error: 'This student does not belong to your college.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Helper to send email notification
    const dispatchNotificationEmail = async () => {
      const studentEmail = targetStudent.email;
      if (!studentEmail) {
        console.warn(`[email] Cannot send ${status} notification: student ${id} does not have an email.`);
        return;
      }

      const origin = new URL(request.url).origin;
      const college = targetStudent.college_name || locals.collegeName;

      try {
        if (status === 'approved') {
          console.info(`[email] Dispatching approval email to ${studentEmail}...`);
          await sendStudentApprovalEmail({
            toEmail: studentEmail,
            studentName: targetStudent.full_name,
            collegeName: college,
            siteUrl: origin,
          });
        } else if (status === 'rejected') {
          console.info(`[email] Dispatching rejection email to ${studentEmail}...`);
          await sendStudentRejectionEmail({
            toEmail: studentEmail,
            studentName: targetStudent.full_name,
            collegeName: college,
          });
        }
      } catch (err: any) {
        console.error('[email] Notification error:', err?.message || err);
      }
    };

    // 2. Attempt updating via the SECURITY DEFINER RPC function (if migration is applied)
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_student_approval_status', {
      student_id: id,
      new_status: status,
    });

    if (!rpcError && rpcData) {
      if (typeof rpcData === 'object' && rpcData.ok === false) {
        return new Response(JSON.stringify({ ok: false, error: rpcData.error || 'Failed to update student.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await dispatchNotificationEmail();

      return new Response(JSON.stringify({ ok: true, status }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Fallback: Direct table update using authenticated Supabase client
    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({
        approval_status: status,
        role: 'student',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, approval_status');

    if (updateError) {
      return new Response(JSON.stringify({ ok: false, error: updateError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!updated || updated.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'Permission denied by Row Level Security. If you are signed in as a staff member or if the RLS policy is restricted to admins, please run the latest migration in Supabase SQL Editor.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await dispatchNotificationEmail();

    return new Response(JSON.stringify({ ok: true, status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Internal server error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
