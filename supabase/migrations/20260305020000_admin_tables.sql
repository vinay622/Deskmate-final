-- ============================================================
-- DeskMate — Admin tables: documents & staff_members
-- Migration: 20260305020000_admin_tables.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: documents
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'General',
  description      TEXT DEFAULT '',
  uploaded_by_name TEXT DEFAULT '',
  expiry_date      DATE,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'expiring', 'expired')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (students need docs for AI answers)
CREATE POLICY "Authenticated users can read documents"
  ON public.documents FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can insert / update / delete
CREATE POLICY "Admins can manage documents"
  ON public.documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Step 2: staff_members
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_members (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'General',
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT DEFAULT '',
  room       TEXT DEFAULT '',
  hours      TEXT DEFAULT '',
  handles    TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (AI routing needs staff data)
CREATE POLICY "Authenticated users can read staff"
  ON public.staff_members FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can insert / update / delete
CREATE POLICY "Admins can manage staff"
  ON public.staff_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
