# Verified Student Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students must sign up with their college's official email domain and be approved by a college admin before accessing anything.

**Architecture:** A `college_domains` table (dashboard-managed) gates signup server-side; `profiles.approval_status` gates access, enforced centrally in `middleware.ts` (pages → `/pending`, APIs → 401). A new admin Students page approves/rejects. Admin RLS on profiles uses a SECURITY DEFINER helper to avoid policy recursion.

**Tech Stack:** Supabase migration (SQL + RLS), Astro middleware/API routes/pages, vanilla inline JS.

## Global Constraints

- Do NOT commit — standing user hold.
- Verification: `npx astro check` (0 errors) + manual flows. User applies SQL manually in the Supabase dashboard.
- API responses: `{ ok }` / `{ ok:false, error }` shape; explicit status codes; college-scoped writes with explicit `.eq(...)`.
- Domain match: substring after `@`, lowercased, exact. Fail closed when a college has no domains.
- Students only; admins auto-approved. Existing rows grandfathered to `approved`.

## Tasks

### Task 1: Migration `supabase/migrations/20260722000000_verified_signup.sql`
college_domains (+RLS anon/authenticated SELECT, seed 5 colleges) · `profiles.approval_status` + backfill approved · `handle_new_user` sets approved for admins / pending for students (keeps profile fields) · `is_college_admin()` SECURITY DEFINER + "Admins read college profiles" (SELECT) and "Admins update college profiles" (UPDATE) policies. Verify: file review only (manual apply).

### Task 2: Signup validation + pending response
`signup.ts`: for `role==='student'`, before `auth.signUp` — fetch domains for chosen college; none → 400 config message; email domain mismatch → 400 "use your official {college} email". After success (students): return `{ ok: true, pending: true }`. `signup.astro` `handleSignup`: on `data.pending` show success panel instead of redirect. Verify: astro check.

### Task 3: Middleware enforcement + /pending page
`middleware.ts`: select `approval_status`; `locals.approvalStatus`; student + not approved → `/app/*` redirect `/pending`, `/api/*` (except `/api/auth/`) 401 JSON; approved user on `/pending` → `/app/chat`. `env.d.ts`: add `approvalStatus` to Locals if Locals are declared there. New `pending.astro`: auth-gated, status-aware copy, logout button. Verify: astro check.

### Task 4: Admin Students page + API + nav + dashboard tile
`students.astro` (pending first w/ Approve+Reject, processed after w/ status chips; admin-gated) · `api/admin/students/[id].ts` POST `{status}` validated ∈ {approved, rejected}, scoped `.eq(id).eq(college_name).eq(role,'student')` · `AdminLayout.astro` nav "Students" + `"students"` in active union · admin `index.astro` "Awaiting approval" stat tile linking to Students. Verify: astro check 0 errors.

### Task 5: Manual E2E (user)
Apply migration → wrong-domain signup rejected; right-domain → pending panel; pending login → /pending; APIs 401; admin approves on Students page → student enters; reject → declined copy; existing accounts unaffected.
