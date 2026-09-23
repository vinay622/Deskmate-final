# Verified Student Signup (Domain + Admin Approval) — Spec

**Status:** Approved
**Date:** 2026-07-22

## Problem

Signup lets anyone self-declare any college and immediately access that college's documents, announcements, and staff. Two gates fix this: (1) the signup email must belong to the chosen college's official domain, (2) a college admin must approve each student before they get access.

## Decisions (locked)

- Domains managed via **Option A**: a `college_domains` table seeded by migration, edited in the Supabase dashboard (no admin UI yet).
- Approval applies to **students only**; admins are auto-approved (already gated by access codes).
- All existing profiles are **grandfathered as approved** by the migration.
- Fail closed: a college with no configured domains cannot accept student signups.
- Exact domain match (part after `@`, lowercased). No subdomain wildcards.
- Rejected students stay blocked but remain visible; admin can approve later.
- Recommendation (not enforced): re-enable Supabase email confirmation post-demo.

## 1. Migration `supabase/migrations/20260722000000_verified_signup.sql`

- **`college_domains`**: `id UUID PK`, `college_name TEXT NOT NULL`, `domain TEXT NOT NULL` (stored lowercase), `UNIQUE(college_name, domain)`, `created_at`. RLS: SELECT for `anon` + `authenticated` (signup validation runs before a user exists); no INSERT/UPDATE/DELETE policies (dashboard-only management).
- Seed placeholder domains for the 5 demo colleges (user edits real ones in dashboard):
  Demo University → `demo.edu`; JNTU Hyderabad → `jntuh.ac.in`; BITS Pilani → `bits-pilani.ac.in`; VIT Vellore → `vitstudent.ac.in`; NIT Warangal → `student.nitw.ac.in`.
- **`profiles.approval_status`** `TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected'))`; backfill: `UPDATE profiles SET approval_status = 'approved'` (grandfather all existing rows).
- **`handle_new_user()`**: set `approval_status` = `'approved'` when metadata role is `admin`, else `'pending'`. (Keeps existing profile-field copying.)
- **RLS via SECURITY DEFINER helper** (a `profiles` policy querying `profiles` recurses — known Supabase pitfall):
  - `is_college_admin(target_college TEXT) RETURNS BOOLEAN` — SECURITY DEFINER, checks `auth.uid()` is an admin of `target_college`.
  - Policy "Admins read college profiles" — SELECT USING `is_college_admin(college_name)`.
  - Policy "Admins update college profiles" — UPDATE USING `is_college_admin(college_name)`.

## 2. Signup (`src/pages/api/auth/signup.ts`, `src/pages/signup.astro`)

Server-side, students only, before `auth.signUp`:
1. Fetch `college_domains` rows for the selected college.
2. Zero rows → 400 `"Signups for this college are not configured yet. Please contact your college administration."`
3. Email domain (after `@`, lowercased) not in the list → 400 `"Please use your official {college} email address."`

After successful student signup: respond `{ ok: true, pending: true }` (no redirect). `signup.astro` shows a success panel: *"Account created — you'll get access once your college admin approves you."* Admin signups keep the current redirect flow.

## 3. Enforcement (`src/middleware.ts`)

- Add `approval_status` to the middleware profile select; expose `locals.approvalStatus`.
- If user is a **student** and `approval_status !== 'approved'`:
  - `/app/*` → redirect `/pending`
  - `/api/*` except `/api/auth/*` → 401 JSON `{ ok: false, error: 'Account pending approval' }`
- `/pending` visited by an approved user → redirect `/app/chat`. Visited logged-out → `/login`.

## 4. Pending page (`src/pages/pending.astro`)

Minimal page: DeskMate branding, status-aware copy (pending: "awaiting approval from your college admin"; rejected: "your request was declined — contact your college administration"), and a logout button (posts to `/api/auth/logout`).

## 5. Admin approvals UI

- **`src/pages/app/admin/students.astro`**: students of the admin's college; pending first (Approve/Reject buttons), then recently processed (status chip, admin can still approve a rejected student). Show name, email-derived info, department/year if present, signup date.
- **`src/pages/api/admin/students/[id].ts`**: POST `{ status: 'approved' | 'rejected' }`; validates status; updates `profiles` scoped `.eq('id', id).eq('college_name', locals.collegeName).eq('role', 'student')`.
- **`AdminLayout.astro`**: nav entry "Students" (+ `active` union member `"students"`).
- **`index.astro` (admin dashboard)**: stat tile "Awaiting approval: N" linking to the Students page.
- Profile email display: `profiles` has no email column — the Students page shows `full_name` + profile fields; email is shown only if obtainable without schema change (skip otherwise; YAGNI — no schema addition for display).

## Out of scope (YAGNI)

- Admin UI for managing domains (Option B later).
- Email notifications on approval/rejection.
- Subdomain matching, multiple-college domains sharing.
- Enforcing email confirmation (recommended separately).

## Verification

- `npx astro check` → 0 errors.
- Manual: wrong-domain student signup → clear error; right-domain → pending panel; pending login → `/pending`; API calls blocked (401) while pending; admin sees student on Students page → Approve → student gets in; Reject → `/pending` shows declined copy; existing accounts unaffected; admin signup flow unchanged; college without domains → blocked with config message.
