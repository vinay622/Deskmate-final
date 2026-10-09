-- ============================================================
-- DeskMate — Student Approval Policies & RPC Function
-- Migration: 20261009000000_student_approval_policies.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: Update helper functions to be case-insensitive & trimmed
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_college_admin(target_college TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND LOWER(TRIM(college_name)) = LOWER(TRIM(target_college))
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_college_admin_or_staff(target_college TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
      AND LOWER(TRIM(college_name)) = LOWER(TRIM(target_college))
      AND is_active = true
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Step 2: Allow both college admins and staff to update college profiles
-- (Enables student approval/rejection by both admin & staff members)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins update college profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and staff update college profiles" ON public.profiles;

CREATE POLICY "Admins and staff update college profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_college_admin_or_staff(college_name))
  WITH CHECK (public.is_college_admin_or_staff(college_name));

-- ─────────────────────────────────────────────────────────────
-- Step 3: Dedicated RPC function for student approvals
-- Runs with SECURITY DEFINER to avoid RLS recursion/filter issues,
-- while strictly enforcing that the caller is an active admin/staff
-- of the student's college.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_student_approval_status(
  student_id UUID,
  new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_profile RECORD;
  target_student RECORD;
BEGIN
  -- Validate status parameter
  IF new_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid status. Must be "approved" or "rejected".');
  END IF;

  -- Validate caller: must be an active admin or staff
  SELECT * INTO caller_profile
  FROM public.profiles
  WHERE id = auth.uid()
    AND role IN ('admin', 'staff')
    AND is_active = true;

  IF caller_profile IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized. Only active admins or staff can approve students.');
  END IF;

  -- Fetch student record
  SELECT * INTO target_student
  FROM public.profiles
  WHERE id = student_id;

  IF target_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Student record not found.');
  END IF;

  -- Verify college match
  IF LOWER(TRIM(caller_profile.college_name)) <> LOWER(TRIM(target_student.college_name)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Student does not belong to your college.');
  END IF;

  -- Update student approval status
  UPDATE public.profiles
  SET approval_status = new_status,
      role = 'student',
      updated_at = NOW()
  WHERE id = student_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', student_id,
    'status', new_status
  );
END;
$$;
