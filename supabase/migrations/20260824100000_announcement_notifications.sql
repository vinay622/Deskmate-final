-- ============================================================
-- DeskMate — Announcement notifications
-- Migration: 20260824100000_announcement_notifications.sql
--
-- 1. `notify_students` flag on announcements: admins opt in when
--    posting a notice that students should actively see.
-- 2. `announcement_reads` tracks which user last read which
--    announcement so the chat UI can show an unread badge.
--
-- RLS: reads are scoped to authenticated users of the same college;
-- inserts are per-user only (a user records their own reads).
-- ============================================================

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS notify_students BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  college_name    VARCHAR(255),
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_user
  ON public.announcement_reads(user_id);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Users can read only their own read-markers
CREATE POLICY "Users can view own announcement reads"
  ON public.announcement_reads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can mark only their own reads, for announcements in their college
CREATE POLICY "Users can insert own announcement reads"
  ON public.announcement_reads FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND college_name IS NOT NULL
  );

-- Allow re-marking (upsert) of own rows
CREATE POLICY "Users can update own announcement reads"
  ON public.announcement_reads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
