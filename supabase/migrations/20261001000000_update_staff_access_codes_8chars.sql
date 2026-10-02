-- ============================================================
-- DeskMate — Update Staff Access Codes to 8-character codes
-- Migration: 20261001000000_update_staff_access_codes_8chars.sql
--
-- Rules:
-- 1. Staff access codes: Exactly 8 characters (relevant college acronym + 4 digits)
-- 2. Admin access codes: Unchanged (ADM-<COLLEGE>-<NUMBER>)
-- ============================================================

-- Step 1: Remove existing staff access codes
DELETE FROM public.admin_access_codes WHERE role = 'staff';

-- Step 2: Insert the new 8-character staff access codes for all colleges
INSERT INTO public.admin_access_codes (code, college_name, role) VALUES
  ('VASV7921', 'Vasavi College of Engineering', 'staff'),
  ('VBIT3814', 'Vignana Bharathi Institute of Technology (VBIT)', 'staff'),
  ('CBIT8492', 'Chaitanya Bharathi Institute of Technology (CBIT)', 'staff'),
  ('VNRV5183', 'VNR Vignana Jyothi Institute of Engineering and Technology (VNRVJIET)', 'staff'),
  ('NGIT9264', 'Neil Gogte Institute of Technology (NGIT)', 'staff'),
  ('KMIT6371', 'Keshav Memorial Institute of Technology', 'staff'),
  ('UOHY4829', 'University of Hyderabad', 'staff'),
  ('OSMU7153', 'Osmania University', 'staff'),
  ('IITH8392', 'Indian Institute of Technology Hyderabad', 'staff'),
  ('IIIT2946', 'International Institute of Information Technology Hyderabad', 'staff'),
  ('JNTU5821', 'Jawaharlal Nehru Technological University Hyderabad', 'staff'),
  ('NALS9384', 'NALSAR University of Law', 'staff'),
  ('MANU6172', 'Maulana Azad National Urdu University', 'staff'),
  ('EFLU4928', 'English and Foreign Languages University', 'staff'),
  ('PJTS7319', 'Professor Jayashankar Telangana State Agricultural University', 'staff'),
  ('BRAO8264', 'Dr. B.R. Ambedkar Open University', 'staff'),
  ('MAHU5391', 'Mahindra University', 'staff'),
  ('WOXS8472', 'Woxsen University', 'staff'),
  ('ANUR6193', 'Anurag University', 'staff'),
  ('ICFA3847', 'ICFAI Foundation for Higher Education', 'staff'),
  ('GITA7291', 'GITAM University Hyderabad Campus', 'staff'),
  ('ISBH4918', 'Indian School of Business', 'staff'),
  ('NIMS8263', 'Nizam''s Institute of Medical Sciences', 'staff'),
  ('CMRI5937', 'CMR Institute of Technology Hyderabad', 'staff'),
  ('CVRE7184', 'CVR College of Engineering', 'staff'),
  ('GRIE4826', 'Gokaraju Rangaraju Institute of Engineering and Technology', 'staff'),
  ('IARE9173', 'Institute of Aeronautical Engineering', 'staff'),
  ('JBIE3849', 'J.B. Institute of Engineering and Technology', 'staff'),
  ('DCET6284', 'Deccan College of Engineering and Technology', 'staff'),
  ('ECET8395', 'Ellenki College of Engineering and Technology', 'staff'),
  ('VVIS4719', 'Vishwa Vishwani Institute of Systems and Management', 'staff'),
  ('DCMH6932', 'Dhruva College of Management', 'staff'),
  ('SIIT8174', 'SUN International Institute for Tourism & Management', 'staff'),
  ('NIPE5392', 'National Institute of Pharmaceutical Education and Research Hyderabad', 'staff'),
  ('MREC9481', 'Malla Reddy Engineering College', 'staff'),
  ('MRCE6283', 'Malla Reddy College of Engineering and Technology', 'staff'),
  ('MRIT7194', 'Malla Reddy Institute of Technology', 'staff'),
  ('MCET8362', 'Methodist College of Engineering and Technology', 'staff'),
  ('SCET5927', 'Stanley College of Engineering and Technology for Women', 'staff'),
  ('LIET4816', 'Lords Institute of Engineering and Technology', 'staff'),
  ('SMEC7391', 'St. Mary''s Engineering College', 'staff'),
  ('DEMO2026', 'Demo University', 'staff')
ON CONFLICT (code) DO UPDATE SET
  college_name = EXCLUDED.college_name,
  role = 'staff';
