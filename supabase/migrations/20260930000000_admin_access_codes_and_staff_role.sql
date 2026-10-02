-- ============================================================
-- DeskMate — Admin Access Codes & Staff/Admin Role Hierarchy
-- Migration: 20260930000000_admin_access_codes_and_staff_role.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: Add role column to admin_access_codes table
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.admin_access_codes
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff'
  CHECK (role IN ('staff', 'admin'));

-- Ensure existing codes are explicitly marked as 'staff'
UPDATE public.admin_access_codes
  SET role = 'staff'
  WHERE role IS NULL OR role = '';

-- ─────────────────────────────────────────────────────────────
-- Step 2: Insert dedicated Admin Access Codes for all 41 colleges (+ demo)
-- When an admin signs up using their college's admin access code,
-- they automatically receive the 'admin' role.
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.admin_access_codes (code, college_name, role) VALUES
  ('ADM-VASAVI-7921',   'Vasavi College of Engineering', 'admin'),
  ('ADM-VBIT-3814',     'Vignana Bharathi Institute of Technology (VBIT)', 'admin'),
  ('ADM-CBIT-8492',     'Chaitanya Bharathi Institute of Technology (CBIT)', 'admin'),
  ('ADM-VNRVJIET-5183', 'VNR Vignana Jyothi Institute of Engineering and Technology (VNRVJIET)', 'admin'),
  ('ADM-NGIT-9264',     'Neil Gogte Institute of Technology (NGIT)', 'admin'),
  ('ADM-KMIT-6371',     'Keshav Memorial Institute of Technology', 'admin'),
  ('ADM-UOH-4829',      'University of Hyderabad', 'admin'),
  ('ADM-OU-7153',       'Osmania University', 'admin'),
  ('ADM-IITH-8392',     'Indian Institute of Technology Hyderabad', 'admin'),
  ('ADM-IIITH-2946',    'International Institute of Information Technology Hyderabad', 'admin'),
  ('ADM-JNTUH-5821',    'Jawaharlal Nehru Technological University Hyderabad', 'admin'),
  ('ADM-NALSAR-9384',   'NALSAR University of Law', 'admin'),
  ('ADM-MANUU-6172',    'Maulana Azad National Urdu University', 'admin'),
  ('ADM-EFLU-4928',     'English and Foreign Languages University', 'admin'),
  ('ADM-PJTSAU-7319',   'Professor Jayashankar Telangana State Agricultural University', 'admin'),
  ('ADM-BRAOU-8264',    'Dr. B.R. Ambedkar Open University', 'admin'),
  ('ADM-MU-5391',       'Mahindra University', 'admin'),
  ('ADM-WOXSEN-8472',   'Woxsen University', 'admin'),
  ('ADM-ANURAG-6193',   'Anurag University', 'admin'),
  ('ADM-ICFAI-3847',    'ICFAI Foundation for Higher Education', 'admin'),
  ('ADM-GITAM-7291',    'GITAM University Hyderabad Campus', 'admin'),
  ('ADM-ISB-4918',      'Indian School of Business', 'admin'),
  ('ADM-NIMS-8263',     'Nizam''s Institute of Medical Sciences', 'admin'),
  ('ADM-CMRIT-5937',    'CMR Institute of Technology Hyderabad', 'admin'),
  ('ADM-CVR-7184',      'CVR College of Engineering', 'admin'),
  ('ADM-GRIET-4826',    'Gokaraju Rangaraju Institute of Engineering and Technology', 'admin'),
  ('ADM-IARE-9173',     'Institute of Aeronautical Engineering', 'admin'),
  ('ADM-JBIET-3849',    'J.B. Institute of Engineering and Technology', 'admin'),
  ('ADM-DCET-6284',     'Deccan College of Engineering and Technology', 'admin'),
  ('ADM-ECET-8395',     'Ellenki College of Engineering and Technology', 'admin'),
  ('ADM-VVISM-4719',    'Vishwa Vishwani Institute of Systems and Management', 'admin'),
  ('ADM-DCM-6932',      'Dhruva College of Management', 'admin'),
  ('ADM-SIITM-8174',    'SUN International Institute for Tourism & Management', 'admin'),
  ('ADM-NIPER-5392',    'National Institute of Pharmaceutical Education and Research Hyderabad', 'admin'),
  ('ADM-MREC-9481',     'Malla Reddy Engineering College', 'admin'),
  ('ADM-MRCET-6283',    'Malla Reddy College of Engineering and Technology', 'admin'),
  ('ADM-MRIT-7194',     'Malla Reddy Institute of Technology', 'admin'),
  ('ADM-MCET-8362',     'Methodist College of Engineering and Technology', 'admin'),
  ('ADM-SCETW-5927',    'Stanley College of Engineering and Technology for Women', 'admin'),
  ('ADM-LIET-4816',     'Lords Institute of Engineering and Technology', 'admin'),
  ('ADM-SMEC-7391',     'St. Mary''s Engineering College', 'admin'),
  ('ADM-DEMO-2026',     'Demo University', 'admin')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Step 3: Update profiles table constraint & add is_active column
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('student', 'staff', 'admin'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────
-- Step 4: Update handle_new_user() trigger
-- Auto-approves both admin and staff users. Students remain pending.
-- Sets is_active to true by default.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    college_name,
    degree_program,
    department,
    year,
    hosteller,
    approval_status,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'college_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'degree_program', ''),
    NULLIF(NEW.raw_user_meta_data->>'department', ''),
    NULLIF(NEW.raw_user_meta_data->>'year', '')::SMALLINT,
    CASE
      WHEN NEW.raw_user_meta_data->>'hosteller' = 'true'  THEN true
      WHEN NEW.raw_user_meta_data->>'hosteller' = 'false' THEN false
      ELSE NULL
    END,
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'student') IN ('admin', 'staff') THEN 'approved'
      ELSE 'pending'
    END,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
    college_name = CASE WHEN EXCLUDED.college_name <> '' THEN EXCLUDED.college_name ELSE public.profiles.college_name END,
    degree_program = COALESCE(EXCLUDED.degree_program, public.profiles.degree_program),
    department = COALESCE(EXCLUDED.department, public.profiles.department),
    year = COALESCE(EXCLUDED.year, public.profiles.year),
    hosteller = COALESCE(EXCLUDED.hosteller, public.profiles.hosteller),
    role = EXCLUDED.role,
    approval_status = EXCLUDED.approval_status;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Step 5: Helper functions for RLS
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
      AND college_name = target_college
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
      AND college_name = target_college
      AND is_active = true
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Step 6: Update RLS policies
-- ─────────────────────────────────────────────────────────────

-- Profiles: Admin & staff can read college profiles; only Admin can update college profiles
DROP POLICY IF EXISTS "Admins read college profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and staff read college profiles" ON public.profiles;
CREATE POLICY "Admins and staff read college profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_college_admin_or_staff(college_name));

DROP POLICY IF EXISTS "Admins update college profiles" ON public.profiles;
CREATE POLICY "Admins update college profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_college_admin(college_name));

-- Documents: Admins and staff can manage documents
DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
DROP POLICY IF EXISTS "Admins and staff can manage documents" ON public.documents;
CREATE POLICY "Admins and staff can manage documents"
  ON public.documents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'staff')
        AND is_active = true
    )
  );

-- Staff members directory
DROP POLICY IF EXISTS "Admins can manage staff" ON public.staff_members;
DROP POLICY IF EXISTS "Admins can manage staff members" ON public.staff_members;
DROP POLICY IF EXISTS "Admins and staff can manage staff members" ON public.staff_members;
CREATE POLICY "Admins and staff can manage staff members"
  ON public.staff_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'staff')
        AND is_active = true
    )
  );

-- Query logs
DROP POLICY IF EXISTS "Admins read college query logs" ON public.query_logs;
DROP POLICY IF EXISTS "Admins and staff read college query logs" ON public.query_logs;
CREATE POLICY "Admins and staff read college query logs"
  ON public.query_logs FOR SELECT
  TO authenticated
  USING (public.is_college_admin_or_staff(college_name));

DROP POLICY IF EXISTS "Admins update college query logs" ON public.query_logs;
DROP POLICY IF EXISTS "Admins and staff update college query logs" ON public.query_logs;
CREATE POLICY "Admins and staff update college query logs"
  ON public.query_logs FOR UPDATE
  TO authenticated
  USING (public.is_college_admin_or_staff(college_name));

-- Escalation tickets
DROP POLICY IF EXISTS "Admins read college tickets" ON public.escalation_tickets;
DROP POLICY IF EXISTS "Admins and staff read college tickets" ON public.escalation_tickets;
CREATE POLICY "Admins and staff read college tickets"
  ON public.escalation_tickets FOR SELECT
  TO authenticated
  USING (public.is_college_admin_or_staff(college_name));

DROP POLICY IF EXISTS "Admins update college tickets" ON public.escalation_tickets;
DROP POLICY IF EXISTS "Admins and staff update college tickets" ON public.escalation_tickets;
CREATE POLICY "Admins and staff update college tickets"
  ON public.escalation_tickets FOR UPDATE
  TO authenticated
  USING (public.is_college_admin_or_staff(college_name));
