-- ============================================================
-- DeskMate — Landing-page contact messages (lead capture)
-- Migration: 20260824000000_contact_messages.sql
--
-- Public visitors are unauthenticated, so INSERT is open to anon
-- but SELECT is not. The platform team reads submissions via the
-- Supabase dashboard; /api/contact also emails them when
-- RESEND_API_KEY is configured (DB row is the durable fallback).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  topic      TEXT NOT NULL DEFAULT 'general' CHECK (topic IN ('general', 'partnership')),
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous visitors) can submit via the landing form
CREATE POLICY "Anyone can submit contact messages"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(name) BETWEEN 1 AND 120
    AND char_length(email) BETWEEN 3 AND 200
    AND char_length(message) BETWEEN 1 AND 4000
  );

-- No SELECT policy: only service role / dashboard can read.
