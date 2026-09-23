# Student Digital Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The DeskMate assistant knows each student's degree program, department, year, and hostel status, and tailors answers from existing documents/announcements accordingly.

**Architecture:** Extend the `profiles` table with four nullable columns. Collect them (optionally) at signup and via a "My Profile" modal in chat. On every chat query, `generate.ts` fetches the caller's profile server-side, appends profile terms to the retrieval query, and passes the profile into `generateResponseStream`, which injects a `--- STUDENT PROFILE ---` block into the prompt context (same pattern as the announcements block).

**Tech Stack:** Astro (SSR pages + API routes), Supabase (Postgres + RLS + auth triggers), Pinecone (retrieval), vanilla JS `is:inline` scripts, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-20-student-profile-design.md`

## Global Constraints

- **STANDING USER HOLD: do NOT run `git commit`.** The user has said "don't commit yet." Skip every commit step until the user lifts the hold. All other steps proceed normally.
- This repo has **no automated test framework**. The verify cycle is: `npx astro check` must report **0 errors** after every task, plus the manual verification steps given per task. Do not introduce a test framework.
- All API responses use the codebase's `{ ok: true, ... }` / `{ ok: false, error }` JSON shape with explicit status codes.
- DB access from API routes always uses `createSupabaseServerClient(request, cookies)` and scopes writes with an explicit `.eq(...)` on the caller's own id (defense-in-depth alongside RLS).
- Null profile field = "not provided". Never coerce missing values to defaults.
- The user applies SQL migrations **manually** in the Supabase dashboard. After Task 1, remind them; do not attempt to run SQL yourself.
- Frontend scripts are vanilla JS in `<script is:inline>` blocks — no imports, no TypeScript syntax inside them.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260720000000_student_profile.sql`

**Interfaces:**
- Consumes: existing `public.profiles` table and `handle_new_user()` trigger from `supabase/migrations/20260305000000_auth_setup.sql`
- Produces: columns `profiles.degree_program TEXT`, `profiles.department TEXT`, `profiles.year SMALLINT`, `profiles.hosteller BOOLEAN` (all nullable); trigger copies same-named keys from signup metadata. Note: the RLS policy "Users can update own profile" **already exists** in `20260305000000_auth_setup.sql` — do NOT recreate it.

- [ ] **Step 1: Write the migration file** with exactly this content:

```sql
-- ============================================================
-- DeskMate — Student Digital Profile fields
-- Migration: 20260720000000_student_profile.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Step 1: Add nullable profile fields (null = not provided)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS degree_program TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS year SMALLINT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hosteller BOOLEAN;

-- ─────────────────────────────────────────────────────────────
-- Step 2: Copy new fields from signup metadata on user creation
-- (RLS policy "Users can update own profile" already exists —
--  see 20260305000000_auth_setup.sql — do not recreate it.)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, college_name, degree_program, department, year, hosteller)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'college_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'degree_program', ''),
    NULLIF(NEW.raw_user_meta_data->>'department', ''),
    NULLIF(NEW.raw_user_meta_data->>'year', '')::SMALLINT,
    CASE
      WHEN NEW.raw_user_meta_data->>'hosteller' = 'true'  THEN true
      WHEN NEW.raw_user_meta_data->>'hosteller' = 'false' THEN false
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
```

- [ ] **Step 2: Verify the file parses as intended** (visual check: 4 ALTERs, 1 CREATE OR REPLACE FUNCTION, no policy statements).

- [ ] **Step 3: Remind the user** to run this file's contents in the Supabase dashboard SQL Editor (they apply migrations manually). Feature code in later tasks tolerates missing columns only by failing non-fatally in chat; the profile modal/API will error until applied.

- [ ] **Step 4: Commit** — SKIPPED under standing user hold (see Global Constraints).

---

### Task 2: Signup collects profile fields

**Files:**
- Modify: `src/pages/signup.astro` (form markup ~line 304 before the Admin Access Code block; role-toggle script ~line 410)
- Modify: `src/pages/api/auth/signup.ts`

**Interfaces:**
- Consumes: existing form → `POST /api/auth/signup` via FormData; existing `supabase.auth.signUp({ options: { data } })` call
- Produces: metadata keys `degree_program` (string), `department` (string), `year` ('1'–'5' as string), `hosteller` ('true' | 'false' | '') — matching what Task 1's trigger reads

- [ ] **Step 1: Add student-only fields to `signup.astro`.** Insert this block immediately BEFORE the `<!-- Admin Access Code (shown only for admin role) -->` comment (~line 304). Visible by default (student radio is checked by default):

```html
            <!-- Student profile fields (hidden for admin role) -->
            <div id="student-profile-fields" class="flex flex-col gap-4">
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-dark uppercase tracking-wide" for="degree-program">Degree <span class="normal-case font-normal text-[#aaa]">(optional)</span></label>
                  <select id="degree-program" name="degree_program" class="w-full px-4 py-3.5 border border-[#e0e0e0] rounded-[14px] text-dark text-sm outline-none focus:border-dark transition-all bg-white">
                    <option value="">Select degree</option>
                    <option value="B.Tech">B.Tech</option>
                    <option value="M.Tech">M.Tech</option>
                    <option value="MBA">MBA</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-dark uppercase tracking-wide" for="department">Department <span class="normal-case font-normal text-[#aaa]">(optional)</span></label>
                  <input type="text" id="department" name="department" placeholder="e.g. CSE" class="w-full px-4 py-3.5 border border-[#e0e0e0] rounded-[14px] text-dark text-sm outline-none focus:border-dark transition-all" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-dark uppercase tracking-wide" for="year">Year <span class="normal-case font-normal text-[#aaa]">(optional)</span></label>
                  <select id="year" name="year" class="w-full px-4 py-3.5 border border-[#e0e0e0] rounded-[14px] text-dark text-sm outline-none focus:border-dark transition-all bg-white">
                    <option value="">Select year</option>
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                    <option value="4">4th Year</option>
                    <option value="5">5th Year</option>
                  </select>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-dark uppercase tracking-wide" for="hosteller">Hostel resident? <span class="normal-case font-normal text-[#aaa]">(optional)</span></label>
                  <select id="hosteller" name="hosteller" class="w-full px-4 py-3.5 border border-[#e0e0e0] rounded-[14px] text-dark text-sm outline-none focus:border-dark transition-all bg-white">
                    <option value="">Prefer not to say</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>
            </div>
```

- [ ] **Step 2: Toggle the block on role change.** In the existing role-change listener in `signup.astro` (~line 410), extend both branches:

```js
  // Show/hide admin access code field based on role selection
  document.querySelectorAll('input[name="role"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      var codeField = document.getElementById('access-code-field');
      var codeInput = document.getElementById('access-code');
      var studentFields = document.getElementById('student-profile-fields');
      if (this.value === 'admin') {
        codeField.classList.remove('hidden');
        studentFields.classList.add('hidden');
      } else {
        codeField.classList.add('hidden');
        codeInput.value = '';
        studentFields.classList.remove('hidden');
      }
    });
  });
```

- [ ] **Step 3: Pass fields through `signup.ts`.** In `src/pages/api/auth/signup.ts`, after the existing `const accessCode = ...` line, add:

```ts
  const degreeProgram = String(formData.get('degree_program') ?? '').trim();
  const department = String(formData.get('department') ?? '').trim();
  const yearRaw = String(formData.get('year') ?? '').trim();
  const hostellerRaw = String(formData.get('hosteller') ?? '').trim();
```

Then extend the `options.data` object of the existing `supabase.auth.signUp` call (student metadata only when role is student):

```ts
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${firstName} ${lastName}`,
        role,
        college_name: college,
        ...(role === 'student'
          ? {
              degree_program: degreeProgram,
              department: department,
              year: yearRaw,
              hosteller: hostellerRaw,
            }
          : {}),
      },
    },
  });
```

- [ ] **Step 4: Verify** — run `npx astro check`; expected: `0 errors`.

- [ ] **Step 5: Manual check** — load `/signup`: the four fields show for Student, hide when Admin is selected, reappear when Student is re-selected.

- [ ] **Step 6: Commit** — SKIPPED under standing user hold.

---

### Task 3: Profile API endpoint

**Files:**
- Create: `src/pages/api/profile.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` from `../../lib/supabase`; `locals.user`
- Produces: `GET /api/profile` → `{ ok: true, profile: { degree_program, department, year, hosteller } }`; `POST /api/profile` with JSON body `{ degree_program?, department?, year?, hosteller? }` → `{ ok: true }`. Task 4's modal calls both.

- [ ] **Step 1: Write the endpoint** with exactly this content:

```ts
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

// GET: The signed-in user's own profile fields
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('degree_program, department, year, hosteller')
      .eq('id', locals.user.id)
      .single();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, profile }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Update the signed-in user's own profile fields
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createSupabaseServerClient(request, cookies);

  try {
    const body = await request.json();

    const degreeProgram = typeof body.degree_program === 'string' ? body.degree_program.trim() : '';
    const department = typeof body.department === 'string' ? body.department.trim() : '';

    let year: number | null = null;
    if (body.year !== null && body.year !== undefined && body.year !== '') {
      const parsed = Number(body.year);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
        return new Response(JSON.stringify({ ok: false, error: 'Year must be between 1 and 5.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      year = parsed;
    }

    let hosteller: boolean | null = null;
    if (body.hosteller === true || body.hosteller === 'true') hosteller = true;
    else if (body.hosteller === false || body.hosteller === 'false') hosteller = false;

    const { error } = await supabase
      .from('profiles')
      .update({
        degree_program: degreeProgram || null,
        department: department || null,
        year,
        hosteller,
      })
      .eq('id', locals.user.id);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Verify** — `npx astro check`; expected: `0 errors`.

- [ ] **Step 3: Commit** — SKIPPED under standing user hold.

---

### Task 4: My Profile modal in chat

**Files:**
- Modify: `src/components/chat/ChatInterface.astro` — (a) profile button in the sidebar "User area" (~line 60), (b) modal markup appended near the announcements-bell markup, (c) script block added before the `// ─── Init ───` comment

**Interfaces:**
- Consumes: `GET /api/profile` and `POST /api/profile` from Task 3
- Produces: UI only — no exports

- [ ] **Step 1: Add the profile button.** In the sidebar "User area", insert a button BEFORE the logout `<form>`:

```html
        <button id="open-profile-modal" class="p-1.5 rounded-lg hover:bg-[#ececec] text-[#aaa] hover:text-dark transition-colors" title="My Profile">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
```

- [ ] **Step 2: Add the modal markup** at the end of the component's HTML (immediately before the `<script is:inline>` that contains chat logic):

```html
<!-- My Profile Modal -->
<div id="profile-modal" class="fixed inset-0 bg-[#000000]/[0.5] backdrop-blur-sm z-[100] hidden items-center justify-center p-4">
  <div class="bg-white rounded-[20px] shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-[#e8eaed] max-w-md w-full">
    <div class="flex justify-between items-center px-6 pt-5 pb-4 border-b border-[#e8eaed]">
      <div>
        <p class="text-[10px] uppercase tracking-widest text-[#aaa] font-medium">Personalization</p>
        <h2 class="text-lg font-medium text-dark mt-1">My Profile</h2>
      </div>
      <button id="close-profile-modal" class="p-1.5 rounded-lg text-[#9aa0a6] hover:text-dark hover:bg-[#f0f1f3] transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <form id="profile-form" class="flex flex-col gap-4 px-6 py-5">
      <div id="profile-error" class="hidden text-sm text-red-600 bg-red-50 border border-red-200 rounded-[12px] px-4 py-3"></div>
      <p class="text-xs text-[#9aa0a6] leading-relaxed -mt-1">DeskMate uses this to tailor answers to your year, department, and hostel status.</p>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-dark mb-1.5">Degree</label>
          <select id="profile-degree" class="w-full bg-[#f8f9fb] border border-[#e8eaed] rounded-[12px] px-3 py-2.5 text-sm text-dark outline-none">
            <option value="">Not set</option>
            <option value="B.Tech">B.Tech</option>
            <option value="M.Tech">M.Tech</option>
            <option value="MBA">MBA</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-dark mb-1.5">Department</label>
          <input id="profile-dept" type="text" placeholder="e.g. CSE" class="w-full bg-[#f8f9fb] border border-[#e8eaed] rounded-[12px] px-3 py-2.5 text-sm text-dark outline-none" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-dark mb-1.5">Year</label>
          <select id="profile-year" class="w-full bg-[#f8f9fb] border border-[#e8eaed] rounded-[12px] px-3 py-2.5 text-sm text-dark outline-none">
            <option value="">Not set</option>
            <option value="1">1st Year</option>
            <option value="2">2nd Year</option>
            <option value="3">3rd Year</option>
            <option value="4">4th Year</option>
            <option value="5">5th Year</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-dark mb-1.5">Hostel resident?</label>
          <select id="profile-hostel" class="w-full bg-[#f8f9fb] border border-[#e8eaed] rounded-[12px] px-3 py-2.5 text-sm text-dark outline-none">
            <option value="">Not set</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>
      <button type="button" id="save-profile-btn" class="w-full bg-dark text-white rounded-[12px] py-3 text-sm font-medium hover:bg-[#2d2e3a] transition-colors mt-1">
        Save Profile
      </button>
    </form>
  </div>
</div>
```

- [ ] **Step 3: Add the modal script** inside the existing main `<script is:inline>` block, immediately before the `// ─── Init ───` comment:

```js
  // ─── My Profile modal ───
  (function () {
    var modal = document.getElementById('profile-modal');
    var openBtn = document.getElementById('open-profile-modal');
    var closeBtn = document.getElementById('close-profile-modal');
    var saveBtn = document.getElementById('save-profile-btn');
    var errEl = document.getElementById('profile-error');
    if (!modal || !openBtn) return;

    function openModal() {
      errEl.classList.add('hidden');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      fetch('/api/profile')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok && data.profile) {
            document.getElementById('profile-degree').value = data.profile.degree_program || '';
            document.getElementById('profile-dept').value = data.profile.department || '';
            document.getElementById('profile-year').value = data.profile.year != null ? String(data.profile.year) : '';
            document.getElementById('profile-hostel').value = data.profile.hosteller === true ? 'true' : data.profile.hosteller === false ? 'false' : '';
          }
        })
        .catch(function () { /* leave fields as-is */ });
    }
    function closeModal() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          degree_program: document.getElementById('profile-degree').value,
          department: document.getElementById('profile-dept').value,
          year: document.getElementById('profile-year').value || null,
          hosteller: document.getElementById('profile-hostel').value || null,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) {
            closeModal();
          } else {
            errEl.textContent = (data && data.error) || 'Failed to save.';
            errEl.classList.remove('hidden');
          }
        })
        .catch(function () {
          errEl.textContent = 'Network error. Please try again.';
          errEl.classList.remove('hidden');
        })
        .finally(function () {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Profile';
        });
    });
  })();
```

- [ ] **Step 4: Verify** — `npx astro check`; expected: `0 errors`.

- [ ] **Step 5: Manual check** — in chat: click the profile icon → modal opens with current values → change a field → Save → reopen → value persisted. (Requires Task 1 SQL applied.)

- [ ] **Step 6: Commit** — SKIPPED under standing user hold.

---

### Task 5: Chat personalization (core)

**Files:**
- Modify: `src/lib/rag.ts` — add `StudentProfile` interface + `buildProfileBlock()` helper; add `profile` param to `generateResponseStream`; inject block into `contextBlock`
- Modify: `src/pages/api/chat/generate.ts` — fetch profile, boost retrieval query, pass profile through

**Interfaces:**
- Consumes: `profiles` columns from Task 1
- Produces: `export interface StudentProfile { degreeProgram: string | null; department: string | null; year: number | null; hosteller: boolean | null; }` in `rag.ts`; `generateResponseStream(..., queryLogId?, profile?: StudentProfile | null)` — new optional final parameter

- [ ] **Step 1: Add the interface and helper to `rag.ts`.** Insert directly ABOVE the `export type StreamChunk =` declaration:

```ts
export interface StudentProfile {
  degreeProgram: string | null;
  department: string | null;
  year: number | null;
  hosteller: boolean | null;
}

// Builds the prompt-context block describing who the student is.
// Returns '' when there is no profile or every field is empty.
function buildProfileBlock(name: string | undefined, profile: StudentProfile | null | undefined): string {
  if (!profile) return '';
  const parts: string[] = [];
  const missing: string[] = [];

  if (name) parts.push(`Name: ${name}`);
  if (profile.degreeProgram) parts.push(`Program: ${profile.degreeProgram}`); else missing.push('degree program');
  if (profile.department) parts.push(`Department: ${profile.department}`); else missing.push('department');
  if (profile.year != null) parts.push(`Year: ${profile.year}`); else missing.push('year');
  if (profile.hosteller != null) parts.push(`Hostel resident: ${profile.hosteller ? 'yes' : 'no'}`); else missing.push('hostel status');

  // Emit the block whenever a profile row exists — even fully empty — so the
  // missing-fields nudge instruction below still reaches the model (spec: Option A nudge).
  let block = '\n--- STUDENT PROFILE ---\n';
  block += parts.length > 0 ? parts.join(' | ') + '\n' : 'No profile details provided.\n';
  block += 'Use this profile to tailor answers: when documents or announcements contain year-, department-, program-, or hostel-specific information, answer with the part that applies to this student and say so.\n';
  if (missing.length > 0) {
    block += `Missing profile fields: ${missing.join(', ')}. If the answer would differ based on a missing field, add one short line suggesting the student complete their profile via "My Profile" in the sidebar.\n`;
  }
  block += '--- END PROFILE ---\n';
  return block;
}
```

- [ ] **Step 2: Add the `profile` parameter to `generateResponseStream`.** Change the signature's final parameters from:

```ts
  student?: { id: string; name: string },
  queryLogId?: string | null
): AsyncGenerator<StreamChunk> {
```

to:

```ts
  student?: { id: string; name: string },
  queryLogId?: string | null,
  profile?: StudentProfile | null
): AsyncGenerator<StreamChunk> {
```

- [ ] **Step 3: Inject the block.** In `generateResponseStream`, find the line `contextBlock += announcementsBlock;` and change it to:

```ts
  contextBlock += buildProfileBlock(student?.name, profile);
  contextBlock += announcementsBlock;
```

- [ ] **Step 4: Fetch the profile in `generate.ts`.** Insert AFTER the `// Rewrite the query...` block (`const rewritten = await rewriteQuery(query, history);`) and BEFORE the embedding block:

```ts
  // Fetch the student's profile for personalization (non-fatal; admins skipped)
  let profile: StudentProfile | null = null;
  if (locals.userRole !== 'admin') {
    try {
      const supabase = createSupabaseServerClient(request, cookies);
      const { data: p } = await supabase
        .from('profiles')
        .select('degree_program, department, year, hosteller')
        .eq('id', locals.user.id)
        .single();
      if (p) {
        profile = {
          degreeProgram: p.degree_program ?? null,
          department: p.department ?? null,
          year: p.year ?? null,
          hosteller: p.hosteller ?? null,
        };
      }
    } catch (profErr: any) {
      console.error('Profile fetch failed (non-fatal):', profErr?.message || profErr);
    }
  }

  // Retrieval boost: append profile terms so dept/year-specific chunks surface
  const profileTerms = profile
    ? [
        profile.degreeProgram,
        profile.department,
        profile.year != null ? `year ${profile.year}` : null,
        profile.hosteller ? 'hostel' : null,
      ].filter(Boolean).join(' ')
    : '';
```

And update the import at the top of `generate.ts` from:

```ts
import type { SearchResult } from '../../../lib/rag';
```

to:

```ts
import type { SearchResult, StudentProfile } from '../../../lib/rag';
```

- [ ] **Step 5: Boost the embedding query.** In the embedding block, change:

```ts
    const queryEmbedding = await embedSingleText(rewritten);
```

to:

```ts
    const queryEmbedding = await embedSingleText(profileTerms ? `${rewritten} ${profileTerms}` : rewritten);
```

- [ ] **Step 6: Pass the profile through.** In the streaming call inside `generate.ts` (`for await (const chunk of generateResponseStream(`), append `profile` as the final argument after `queryLogId`. The call becomes:

```ts
        for await (const chunk of generateResponseStream(
          query,
          chunks,
          agent,
          history,
          locals.collegeName ?? undefined,
          request,
          cookies,
          student,
          queryLogId,
          profile,
        )) {
```

(Match the actual existing argument list — the key change is adding `profile` at the end.)

- [ ] **Step 7: Verify** — `npx astro check`; expected: `0 errors`.

- [ ] **Step 8: Commit** — SKIPPED under standing user hold.

---

### Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1:** `npx astro check` → `0 errors`.
- [ ] **Step 2:** Confirm with the user that Task 1's SQL has been applied in Supabase.
- [ ] **Step 3: Manual flows** (dev server running, student account):
  1. Open My Profile → set Program=B.Tech, Department=CSE, Year=4, Hostel=Yes → Save → reopen → persisted.
  2. Admin posts an announcement with year/department-specific info (e.g. "4th-year B.Tech fee due July 30; hostel fee due Aug 5").
  3. Student asks "when is my fee due?" → answer references THEIR year/dept/hostel portion.
  4. Clear all profile fields → ask again → generic answer + one-line "complete your profile" nudge.
  5. Signup a fresh student filling the new fields → check `profiles` row in Supabase has them.
  6. Admin account chat → no profile block behavior change, no errors.
- [ ] **Step 4:** Report results to the user; list any failures with exact symptoms.

---

## Self-Review Notes

- **Spec coverage:** migration (T1), signup (T2), API (T3), modal (T4), context injection + prompt rules + nudge + retrieval boost (T5), error handling (non-fatal fetch T5; validation T3), testing (T6). Out-of-scope items untouched. ✓
- **Type consistency:** `StudentProfile` defined once in `rag.ts` (camelCase fields), imported by `generate.ts`; DB/API payloads use snake_case column names throughout. ✓
- **No placeholders:** every code step contains full code. ✓
