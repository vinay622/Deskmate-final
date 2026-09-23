# Student Digital Profile — Design Spec

**Date:** 2026-07-20
**Status:** Approved by user
**Scope:** Profile-aware answers (Option A) — the assistant personalizes replies using profile attributes and existing documents/announcements. No per-student records (fee balances, attendance) in this phase; schema and prompt design leave room for that later.

## Goal

The assistant knows who the student is (program, department, year, hostel status) and tailors answers accordingly. Example: "When is my fee due?" → answers with the fee schedule portion that applies to a 4th-year CSE hosteller, instead of the full generic schedule.

## Decisions (user-confirmed)

| Question | Decision |
|---|---|
| Personalization level | A — profile-aware from existing docs (record-level data is a future epic) |
| Profile fields | degree_program, department, year, hosteller (+ existing full_name, college_name) |
| Where collected | Both: signup form (optional fields) AND editable "My Profile" modal in chat |
| Incomplete profile | Answer generically + one-line nudge to complete profile (never block) |
| Architecture | Fetch profile server-side per query in `generate.ts`, inject into prompt context (same pattern as announcements) |

## 1. Database

New migration `supabase/migrations/20260720000000_student_profile.sql`:

- `ALTER TABLE public.profiles ADD COLUMN` (all nullable):
  - `degree_program TEXT`
  - `department TEXT`
  - `year SMALLINT`
  - `hosteller BOOLEAN`
- Update `handle_new_user()` trigger function to copy these four fields from `raw_user_meta_data` when present.
- Verify/add RLS policy allowing users to UPDATE their own profiles row (`id = auth.uid()`). Check existing policies in `20260305000000_auth_setup.sql` first; add only if missing.

Null = "not provided" — drives nudge behavior. No new tables.

## 2. Signup form (`src/pages/signup.astro`, `src/pages/api/auth/signup.ts`)

- Student role only (hidden for admin role): degree program select (B.Tech, M.Tech, MBA, Other), department text input, year select (1–5), hostel checkbox.
- All optional; signup never blocks on them.
- `signup.ts` passes them in `auth.signUp options.data`; the trigger writes them to `profiles`.

## 3. My Profile modal (`src/components/chat/ChatInterface.astro`, new `src/pages/api/profile.ts`)

- Profile button in the chat sidebar user section opens a modal (same pattern/styling as admin staff modal: `.app-input`, `btn-app-primary`).
- Pre-filled with current values via `GET /api/profile` fetched when the modal opens (keeps chat page load unchanged; the endpoint exists anyway for POST).
- Save → `POST /api/profile`: auth required, updates ONLY the caller's own row (`eq('id', locals.user.id)`), validates year ∈ 1–5, trims strings. Returns `{ok: true}` shape consistent with other endpoints.

## 4. Chat integration (`src/pages/api/chat/generate.ts`, `src/lib/rag.ts`)

- `generate.ts`: one Supabase read of the caller's profile row per query. Non-fatal on failure (log + continue), same as query-log insert. Pass profile object into `generateResponseStream`.
- `rag.ts` context injection (only when at least one profile field is set, and only for students):

```
--- STUDENT PROFILE ---
Name: <name> | Program: <program> | Department: <dept> | Year: <year> | Hostel resident: <yes/no>
--- END PROFILE ---
```

- System prompt additions:
  1. Use the profile to tailor answers — when documents/announcements contain year/department/hostel-specific info, answer with the part that applies to this student and say so.
  2. If profile fields are missing AND the answer would differ by department/year/hostel, append one short line suggesting the student complete My Profile. (Model-driven nudge — no separate code path.)
- Retrieval boost: append present profile terms to the rewritten Pinecone search query (plain string concat, no extra LLM call) so department/year-specific chunks surface.

## 5. Error handling & edge cases

- Profile fetch failure → chat proceeds without profile block.
- Admin users → no profile block injected.
- All fields empty → block omitted; nudge rule applies.
- Existing users → nulls until they edit My Profile.
- `/api/profile` rejects unauthenticated calls; only own-row updates possible (RLS + explicit `eq('id', user.id)` defense-in-depth, consistent with codebase convention).

## 6. Testing

- `npx astro check` must pass (0 errors) after each phase.
- Manual flows: signup with fields → profile visible in modal → dept-specific question answered with profile context → edit profile → answer reflects change → empty-profile query shows nudge → admin chat unaffected.

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/20260720000000_student_profile.sql` | new — columns, trigger update, RLS check |
| `src/pages/signup.astro` | 4 optional student fields |
| `src/pages/api/auth/signup.ts` | pass fields in metadata |
| `src/components/chat/ChatInterface.astro` | My Profile modal + sidebar button |
| `src/pages/api/profile.ts` | new — GET own profile, POST update own profile |
| `src/pages/api/chat/generate.ts` | fetch profile, pass to stream |
| `src/lib/rag.ts` | profile context block, prompt additions, retrieval boost |

## Out of scope (future)

- Per-student records (fee balances, due-date overrides, attendance, results) — record-level personalization epic.
- Auto year-advancement; section/roll number fields.
