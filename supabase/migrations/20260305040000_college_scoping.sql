-- ============================================================
-- DeskMate — College scoping: per-college access codes + documents
-- Migration: 20260305040000_college_scoping.sql
-- ============================================================

-- Step 1: Clear old seed access codes
DELETE FROM public.admin_access_codes WHERE is_used = false;

-- Step 2: Insert all colleges with their access codes
INSERT INTO public.admin_access_codes (code, college_name) VALUES
  ('A9K3T7Q2',   'Vasavi College of Engineering'),
  ('VB12IT34',   'Vignana Bharathi Institute of Technology (VBIT)'),
  ('M4P8Z1X6',   'Chaitanya Bharathi Institute of Technology (CBIT)'),
  ('Q7L2D9F5',   'VNR Vignana Jyothi Institute of Engineering and Technology (VNRVJIET)'),
  ('T6R3W8K1',   'Neil Gogte Institute of Technology (NGIT)'),
  ('H2Y7C5N9',   'Keshav Memorial Institute of Technology'),
  ('U8P3M6K2',   'University of Hyderabad'),
  ('O4Z7A1L9',   'Osmania University'),
  ('I9T3H7X4',   'Indian Institute of Technology Hyderabad'),
  ('I2I8R6K5',   'International Institute of Information Technology Hyderabad'),
  ('J6N3T9P1',   'Jawaharlal Nehru Technological University Hyderabad'),
  ('N7L2S5A8',   'NALSAR University of Law'),
  ('M3U9R4Z6',   'Maulana Azad National Urdu University'),
  ('E5F8L1T3',   'English and Foreign Languages University'),
  ('A7G2T6S4',   'Professor Jayashankar Telangana State Agricultural University'),
  ('B9R3O8K1',   'Dr. B.R. Ambedkar Open University'),
  ('M1H8D4Z7',   'Mahindra University'),
  ('W7X3E9L5',   'Woxsen University'),
  ('A4N6R2K9',   'Anurag University'),
  ('I8C3F7A2',   'ICFAI Foundation for Higher Education'),
  ('G5T9M2P6',   'GITAM University Hyderabad Campus'),
  ('S6B1H8K3',   'Indian School of Business'),
  ('N3I7M5S2',   'Nizam''s Institute of Medical Sciences'),
  ('C5M9R1T7',   'CMR Institute of Technology Hyderabad'),
  ('V2R8C4E6',   'CVR College of Engineering'),
  ('G6R2I9T4',   'Gokaraju Rangaraju Institute of Engineering and Technology'),
  ('A4E7R2O9',   'Institute of Aeronautical Engineering'),
  ('J2B8I6T5',   'J.B. Institute of Engineering and Technology'),
  ('D9C3E7T1',   'Deccan College of Engineering and Technology'),
  ('E3L7K9T2',   'Ellenki College of Engineering and Technology'),
  ('V6W2I8S4',   'Vishwa Vishwani Institute of Systems and Management'),
  ('D1H9R4U7',   'Dhruva College of Management'),
  ('S5U3N8T1',   'SUN International Institute for Tourism & Management'),
  ('P2H7A9R4',   'National Institute of Pharmaceutical Education and Research Hyderabad'),
  ('M8R3E6D1',   'Malla Reddy Engineering College'),
  ('M4R7C9T2',   'Malla Reddy College of Engineering and Technology'),
  ('M2R8I5T7',   'Malla Reddy Institute of Technology'),
  ('M6E1T8H3',   'Methodist College of Engineering and Technology'),
  ('S3C9E7W2',   'Stanley College of Engineering and Technology for Women'),
  ('L8I4T6E1',   'Lords Institute of Engineering and Technology'),
  ('S7M2E5C9',   'St. Mary''s Engineering College')
ON CONFLICT (code) DO NOTHING;

-- Step 3: Add college_name column to documents table
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS college_name TEXT;
