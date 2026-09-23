-- ============================================================
-- DeskMate — Scale-up features: query logs, tickets, announcements
-- Migration: 20260717000000_scale_features.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: query_logs — analytics backbone (every query logged)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.query_logs (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_name      VARCHAR(255) NOT NULL,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id        UUID,
  query             TEXT NOT NULL,
  rewritten_query   TEXT,
  agent             VARCHAR(50) DEFAULT 'general',
  language          VARCHAR(20) DEFAULT 'english',
  had_context       BOOLEAN DEFAULT false,
  top_similarity    NUMERIC,
  escalated         BOOLEAN DEFAULT false,
  escalation_reason VARCHAR(50),
  category          VARCHAR(50),
  feedback          TEXT CHECK (feedback IN ('up', 'down')),
  feedback_reason   TEXT,
  reviewed          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

-- Students insert their own logs
CREATE POLICY "Users insert own query logs"
  ON public.query_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Students update their own logs (feedback)
CREATE POLICY "Users update own query logs"
  ON public.query_logs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Students read their own logs
CREATE POLICY "Users read own query logs"
  ON public.query_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- College admins read all logs for their college
CREATE POLICY "Admins read college query logs"
  ON public.query_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.college_name = query_logs.college_name
    )
  );

-- College admins update logs (mark gaps reviewed)
CREATE POLICY "Admins update college query logs"
  ON public.query_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.college_name = query_logs.college_name
    )
  );

CREATE INDEX IF NOT EXISTS idx_query_logs_college_created ON public.query_logs(college_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_gaps ON public.query_logs(college_name, reviewed) WHERE had_context = false OR feedback = 'down';

-- ─────────────────────────────────────────────────────────────
-- Step 2: escalation_tickets — trackable staff escalations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.escalation_tickets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_name    VARCHAR(255) NOT NULL,
  student_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  student_name    VARCHAR(255) NOT NULL DEFAULT '',
  query           TEXT NOT NULL,
  category        VARCHAR(50),
  staff_name      VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolution_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.escalation_tickets ENABLE ROW LEVEL SECURITY;

-- Students create their own tickets
CREATE POLICY "Students insert own tickets"
  ON public.escalation_tickets FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Students read their own tickets
CREATE POLICY "Students read own tickets"
  ON public.escalation_tickets FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- College admins manage all tickets for their college
CREATE POLICY "Admins manage college tickets"
  ON public.escalation_tickets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.college_name = escalation_tickets.college_name
    )
  );

-- Reuse the updated_at trigger function from the staff migration
CREATE TRIGGER update_escalation_tickets_updated_at
  BEFORE UPDATE ON public.escalation_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_tickets_college_status ON public.escalation_tickets(college_name, status);
CREATE INDEX IF NOT EXISTS idx_tickets_student ON public.escalation_tickets(student_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Step 3: announcements — admin-posted notices
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_name    VARCHAR(255) NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  category        VARCHAR(50) DEFAULT 'General',
  pinned          BOOLEAN DEFAULT false,
  expires_at      TIMESTAMPTZ,
  created_by_name VARCHAR(255) DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- All authenticated users read announcements from their own college
CREATE POLICY "Users read college announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.college_name = announcements.college_name
    )
  );

-- College admins manage announcements
CREATE POLICY "Admins manage college announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.college_name = announcements.college_name
    )
  );

CREATE INDEX IF NOT EXISTS idx_announcements_college ON public.announcements(college_name, pinned DESC, created_at DESC);
