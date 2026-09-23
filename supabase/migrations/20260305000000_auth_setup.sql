-- ============================================================
-- DeskMate College AI Assistant - Auth Database Setup
-- Migration: 20260305000000_auth_setup.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: Create the profiles table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
  full_name TEXT,
  college_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Step 2: Create the admin_access_codes table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_access_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  college_name TEXT NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Step 3: Enable Row Level Security on both tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_access_codes ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- Step 4: RLS policies for profiles
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────
-- Step 5: RLS policies for admin_access_codes
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Anyone can read access codes for verification"
  ON public.admin_access_codes FOR SELECT
  USING (true);

CREATE POLICY "Admins can update access codes"
  ON public.admin_access_codes FOR UPDATE
  USING (true);

-- ─────────────────────────────────────────────────────────────
-- Step 6: Auto-update trigger for updated_at
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Step 7: Seed 5 demo admin access codes
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.admin_access_codes (code, college_name) VALUES
  ('DESKMATE-ADMIN-2024', 'Demo University'),
  ('JNTU-ADMIN-9X72',    'JNTU Hyderabad'),
  ('BITS-ADMIN-K4M1',    'BITS Pilani'),
  ('VIT-ADMIN-P8Q3',     'VIT Vellore'),
  ('NITW-ADMIN-Z5R7',    'NIT Warangal')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Step 8: Auto-create profile on new user registration
-- This trigger runs with SECURITY DEFINER so it bypasses RLS,
-- ensuring the profile is created even when email confirmation
-- is required and the user session is not yet active.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, college_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'college_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
