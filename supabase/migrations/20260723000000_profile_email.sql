-- ============================================================
-- DeskMate — Add email to profiles & update new user trigger
-- Migration: 20260723000000_profile_email.sql
-- ============================================================

-- 1. Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill existing profile emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 3. Update handle_new_user trigger to store email automatically on signup
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
    approval_status
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
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'student') = 'admin' THEN 'approved'
      ELSE 'pending'
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
    college_name = CASE WHEN EXCLUDED.college_name <> '' THEN EXCLUDED.college_name ELSE public.profiles.college_name END,
    degree_program = COALESCE(EXCLUDED.degree_program, public.profiles.degree_program),
    department = COALESCE(EXCLUDED.department, public.profiles.department),
    year = COALESCE(EXCLUDED.year, public.profiles.year),
    hosteller = COALESCE(EXCLUDED.hosteller, public.profiles.hosteller);
  RETURN NEW;
END;
$$;
