-- ============================================================
-- DeskMate — College Admin Domain Management Policies
-- Migration: 20261002000000_college_domains_admin_policies.sql
-- ============================================================

-- Step 1: Allow college admins to insert allowed domains for their college
CREATE POLICY "Admins insert college domains"
  ON public.college_domains FOR INSERT
  TO authenticated
  WITH CHECK (public.is_college_admin(college_name));

-- Step 2: Allow college admins to delete domains for their college
CREATE POLICY "Admins delete college domains"
  ON public.college_domains FOR DELETE
  TO authenticated
  USING (public.is_college_admin(college_name));
