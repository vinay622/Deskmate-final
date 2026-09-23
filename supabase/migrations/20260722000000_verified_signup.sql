-- ============================================================
-- DeskMate — Verified student signup (domain + admin approval)
-- Migration: 20260722000000_verified_signup.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: college_domains — allowed signup email domains
-- Managed via Supabase dashboard for now (no admin UI).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.college_domains (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_name TEXT NOT NULL,
  domain       TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (college_name, domain)
);

ALTER TABLE public.college_domains ENABLE ROW LEVEL SECURITY;

-- Signup validation runs BEFORE a user exists, so anon must read too.
CREATE POLICY "Anyone can read college domains"
  ON public.college_domains FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies: dashboard/service-role management only.

-- Placeholder domains — EDIT THESE in the dashboard to your real domains.
INSERT INTO public.college_domains (college_name, domain) VALUES
  ('Vasavi College of Engineering','vasavi.ac.in'),
  ('Vignana Bharathi Institute of Technology (VBIT)','vbithyd.ac.in'),
  ('Chaitanya Bharathi Institute of Technology (CBIT)','cbit.ac.in'),
  ('VNR Vignana Jyothi Institute of Engineering and Technology','vnrvjiet.ac.in'),
  ('Neil Gogte Institute of Technology (NGIT)','ngit.ac.in'),
  ('Keshav Memorial Institute of Technology','kmit.in'),
  ('University of Hyderabad','uohyd.ac.in'),
  ('Osmania University','osmania.ac.in'),
  ('Indian Institute of Technology Hyderabad','iith.ac.in'),
  ('International Institute of Information Technology Hyderabad','iiit.ac.in'),
  ('Jawaharlal Nehru Technological University Hyderabad','jntuh.ac.in'),
  ('NALSAR University of Law','nalsar.ac.in'),
  ('Maulana Azad National Urdu University','manuu.ac.in'),
  ('English and Foreign Languages University','efluniversity.ac.in'),
  ('Professor Jayashankar Telangana State Agricultural University','pjtsau.edu.in'),
  ('Dr. B.R. Ambedkar Open University','braou.ac.in'),
  ('Mahindra University','mahindrauniversity.edu.in'),
  ('Woxsen University','woxsen.edu.in'),
  ('Anurag University','anurag.edu.in'),
  ('ICFAI Foundation for Higher Education','ifheindia.org'),
  ('GITAM University Hyderabad Campus','gitam.edu'),
  ('Indian School of Business','isb.edu'),
  ('Nizam''s Institute of Medical Sciences','nims.edu.in'),
  ('CMR Institute of Technology Hyderabad','cmritonline.ac.in'),
  ('CVR College of Engineering','cvr.ac.in'),
  ('Gokaraju Rangaraju Institute of Engineering and Technology','griet.ac.in'),
  ('Institute of Aeronautical Engineering','iare.ac.in'),
  ('J.B. Institute of Engineering and Technology','jbiet.edu.in'),
  ('Deccan College of Engineering and Technology','deccancollege.ac.in'),
  ('Ellenki College of Engineering and Technology','ellenkicet.ac.in'),
  ('Vishwa Vishwani Institute of Systems and Management','vishwavishwani.ac.in'),
  ('Dhruva College of Management','dhruva.ac.in'),
  ('SUN International Institute for Tourism & Management','siitam.org'),
  ('National Institute of Pharmaceutical Education and Research Hyderabad','niperhyd.ac.in'),
  ('Malla Reddy Engineering College','mrec.ac.in'),
  ('Malla Reddy College of Engineering and Technology','mrcet.ac.in'),
  ('Malla Reddy Institute of Technology','mrit.ac.in'),
  ('Methodist College of Engineering and Technology','methodist.edu.in'),
  ('Stanley College of Engineering and Technology for Women','stanley.edu.in'),
  ('Lords Institute of Engineering and Technology','lords.ac.in'),
  ('St. Mary''s Engineering College','smec.ac.in')
ON CONFLICT (college_name, domain) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Step 2: profiles.approval_status — student access gate
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Grandfather every existing account so nobody is locked out.
UPDATE public.profiles SET approval_status = 'approved';

-- ─────────────────────────────────────────────────────────────
-- Step 3: New users — admins auto-approved, students pending
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, college_name, degree_program, department, year, hosteller, approval_status)
  VALUES (
    NEW.id,
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
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'student') = 'admin' THEN 'approved'
      ELSE 'pending'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Step 4: Admin read/update of their college's profiles.
-- A profiles policy that queries profiles recurses — use a
-- SECURITY DEFINER helper to break the cycle.
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
  );
$$;

CREATE POLICY "Admins read college profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_college_admin(college_name));

CREATE POLICY "Admins update college profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_college_admin(college_name));
