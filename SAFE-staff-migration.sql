-- SAFE MIGRATION: Add missing columns to existing staff_members table
-- This preserves your existing data while adding the enhanced escalation features

-- Add missing columns one by one
ALTER TABLE public.staff_members
ADD COLUMN IF NOT EXISTS query_categories TEXT[] DEFAULT '{}';

ALTER TABLE public.staff_members
ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{"english"}';

ALTER TABLE public.staff_members
ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(20) DEFAULT 'normal';

ALTER TABLE public.staff_members
ADD COLUMN IF NOT EXISTS college_name VARCHAR(255);

-- Add constraints
ALTER TABLE public.staff_members
ADD CONSTRAINT check_urgency_level
CHECK (urgency_level IN ('normal', 'urgent', 'emergency'));

-- Update your existing staff member with the required categories
UPDATE public.staff_members
SET query_categories = ARRAY['admissions', 'career', 'student affairs', 'welfare'],
    languages = ARRAY['english', 'hindi', 'telugu'],
    urgency_level = 'normal'
WHERE name = 'raju reddy';

-- Set college_name for all existing staff (replace 'Your College Name' with actual name)
UPDATE public.staff_members
SET college_name = 'Indian Institute of Technology Delhi'
WHERE college_name IS NULL;

-- Make college_name required after setting values
ALTER TABLE public.staff_members
ALTER COLUMN college_name SET NOT NULL;

-- Enable RLS if not already enabled
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (these will fail gracefully if they already exist)
DO $$
BEGIN
  -- Try to create the admin policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_members' AND policyname = 'Admins can manage staff from their college') THEN
    EXECUTE 'CREATE POLICY "Admins can manage staff from their college" ON public.staff_members FOR ALL TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role = ''admin''
        AND p.college_name = staff_members.college_name
      )
    )';
  END IF;

  -- Try to create the read policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staff_members' AND policyname = 'Users can read active staff') THEN
    EXECUTE 'CREATE POLICY "Users can read active staff" ON public.staff_members FOR SELECT TO authenticated USING (status = ''active'')';
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_college_status ON public.staff_members(college_name, status);
CREATE INDEX IF NOT EXISTS idx_staff_categories ON public.staff_members USING GIN(query_categories);
CREATE INDEX IF NOT EXISTS idx_staff_languages ON public.staff_members USING GIN(languages);

-- Verify the update worked
SELECT name, query_categories, languages, urgency_level, college_name
FROM public.staff_members
WHERE name = 'raju reddy';