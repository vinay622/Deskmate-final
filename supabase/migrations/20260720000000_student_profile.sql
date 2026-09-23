-- ============================================================
-- DeskMate — Student Digital Profile fields
-- Migration: 20260720000000_student_profile.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: Add nullable profile fields (null = not provided)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS degree_program TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS year SMALLINT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hosteller BOOLEAN;

-- ─────────────────────────────────────────────────────────────
-- Step 2: Copy new fields from signup metadata on user creation
-- (RLS policy "Users can update own profile" already exists —
--  see 20260305000000_auth_setup.sql — do not recreate it.)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, college_name, degree_program, department, year, hosteller)
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
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
