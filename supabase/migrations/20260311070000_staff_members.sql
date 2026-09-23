-- Fresh start: Drop and recreate staff_members table with sophisticated escalation schema
DROP TABLE IF EXISTS public.staff_members CASCADE;

CREATE TABLE public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  role VARCHAR(255),
  query_categories TEXT[] NOT NULL DEFAULT '{}', -- Array of categories this staff handles
  email VARCHAR(255),
  phone VARCHAR(20),
  whatsapp VARCHAR(20),
  office_location VARCHAR(255),
  office_hours VARCHAR(255), -- e.g., "Mon-Fri 9AM-5PM"
  languages TEXT[] DEFAULT '{"english"}', -- For language-based routing
  urgency_level VARCHAR(20) DEFAULT 'normal' CHECK (urgency_level IN ('normal', 'urgent', 'emergency')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  college_name VARCHAR(255) NOT NULL, -- College scoping
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- RLS Policy: College-scoped admin management
CREATE POLICY "Admins can manage staff from their college"
ON public.staff_members FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
    AND p.college_name = staff_members.college_name
  )
);

-- RLS Policy: All authenticated users can read active staff (for AI routing)
CREATE POLICY "Users can read active staff"
ON public.staff_members FOR SELECT
TO authenticated
USING (status = 'active');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_staff_members_updated_at
    BEFORE UPDATE ON public.staff_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_staff_college_status ON public.staff_members(college_name, status);
CREATE INDEX idx_staff_categories ON public.staff_members USING GIN(query_categories);
CREATE INDEX idx_staff_languages ON public.staff_members USING GIN(languages);

-- Add sample staff data for demonstration (can be removed after testing)
INSERT INTO public.staff_members (name, department, role, query_categories, email, phone, whatsapp, office_location, office_hours, languages, urgency_level, college_name) VALUES
('Dr. Rajesh Kumar', 'Admissions', 'Admissions Officer', ARRAY['admissions', 'enrollment'], 'rajesh.admissions@college.edu', '+91-9876543210', '+91-9876543210', 'Admin Block - Room 101', 'Mon-Fri 9AM-5PM', ARRAY['english', 'hindi'], 'normal', 'Indian Institute of Technology Delhi'),
('Ms. Priya Sharma', 'Accounts', 'Finance Officer', ARRAY['fee', 'accounts', 'payments'], 'priya.accounts@college.edu', '+91-9876543211', '+91-9876543211', 'Accounts Office - Ground Floor', 'Mon-Fri 9AM-6PM', ARRAY['english', 'hindi'], 'urgent', 'Indian Institute of Technology Delhi'),
('Prof. Amit Singh', 'Examinations', 'Controller of Examinations', ARRAY['examinations', 'results', 'academic'], 'amit.exams@college.edu', '+91-9876543212', '+91-9876543212', 'Exam Section - First Floor', 'Mon-Fri 10AM-4PM', ARRAY['english'], 'normal', 'Indian Institute of Technology Delhi'),
('Ms. Sunita Verma', 'Training & Placement', 'Placement Officer', ARRAY['placements', 'internships', 'career'], 'sunita.placements@college.edu', '+91-9876543213', '+91-9876543213', 'Placement Cell - Second Floor', 'Mon-Fri 9AM-5PM', ARRAY['english', 'telugu'], 'normal', 'Indian Institute of Technology Delhi'),
('Mr. Ravi Patel', 'Student Affairs', 'Dean Student Affairs', ARRAY['hostel', 'student affairs', 'welfare'], 'ravi.affairs@college.edu', '+91-9876543214', '+91-9876543214', 'Student Affairs Office', 'Mon-Sat 8AM-8PM', ARRAY['english', 'hindi'], 'emergency', 'Indian Institute of Technology Delhi'),
('Dr. Meera Joshi', 'Computer Science', 'HOD Computer Science', ARRAY['academic', 'computer science', 'technical'], 'meera.cs@college.edu', '+91-9876543215', '+91-9876543215', 'CS Department - Third Floor', 'Mon-Fri 9AM-5PM', ARRAY['english'], 'normal', 'Indian Institute of Technology Delhi');