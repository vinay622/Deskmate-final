# Feedback Thumbs in Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 👍/👎 buttons to completed bot messages that write feedback to the query's `query_logs` row, feeding the existing admin analytics dashboard.

**Architecture:** Purely additive. A new `POST /api/chat/feedback` route updates `query_logs.feedback`/`feedback_reason` for the authenticated student's own row (RLS-enforced). The chat client captures the already-emitted `queryLogId` from the `done` SSE event, renders thumb buttons after streaming completes, and POSTs on click. No migration — schema, RLS, and the `queryLogId` wire already exist.

**Tech Stack:** Astro API routes, Supabase JS server client, vanilla client JS (inline `<script>` in `.astro`), Tailwind.

## Global Constraints

- No migration. `query_logs.feedback` already has `CHECK (feedback IN ('up','down'))`; `feedback_reason TEXT` exists.
- Do NOT commit — user has a standing "don't commit yet" hold. Skip all `git commit` steps.
- Verification is `npx astro check` (0 errors) + manual browser flow. No unit-test framework in this project for chat client code.
- Match existing API route shape: `{ ok: true }` / `{ ok: false, error }`, `Content-Type: application/json`, 401 unauth / 400 bad input / 500 error.
- Client JS style in `ChatInterface.astro` is ES5-ish `var` + `function`; match it, no `const`/arrow in that file's inline script.

---

### Task 1: Feedback API endpoint

**Files:**
- Create: `src/pages/api/chat/feedback.ts`

**Interfaces:**
- Produces: `POST /api/chat/feedback` accepting JSON body `{ queryLogId: string, feedback: 'up' | 'down', reason?: string }`, returning `{ ok: true }` on success or `{ ok: false, error: string }` with status 400/401/500.
- Consumes: `createSupabaseServerClient` from `../../../lib/supabase` (three levels up from `api/chat/`), `locals.user` for auth.

- [ ] **Step 1: Create the endpoint file**

Create `src/pages/api/chat/feedback.ts`:

```ts
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

// POST /api/chat/feedback — student rates a bot answer (up/down + optional reason)
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const queryLogId = body.queryLogId as string | undefined;
    const feedback = body.feedback as string | undefined;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

    if (!queryLogId) {
      return new Response(JSON.stringify({ ok: false, error: 'queryLogId is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (feedback !== 'up' && feedback !== 'down') {
      return new Response(JSON.stringify({ ok: false, error: 'feedback must be "up" or "down"' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseServerClient(request, cookies);
    const { error } = await supabase
      .from('query_logs')
      .update({ feedback, feedback_reason: reason })
      .eq('id', queryLogId)
      .eq('user_id', user.id);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors, 0 warnings related to `feedback.ts`.

- [ ] **Step 3: Smoke-test the route responds**

Start dev server (`npm run dev`) if not running. In the browser devtools console (logged in as a student), run:

```js
fetch('/api/chat/feedback', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ feedback: 'up' }) }).then(r => r.json()).then(console.log)
```

Expected: `{ ok: false, error: 'queryLogId is required' }` (400) — confirms auth passed and validation works.

---

### Task 2: Capture queryLogId + render thumbs in chat client

**Files:**
- Modify: `src/components/chat/ChatInterface.astro` (done handler ~line 895; post-stream append block ~line 917)

**Interfaces:**
- Consumes: `parsed.queryLogId` from the `done` SSE event (already emitted by `rag.ts`); `POST /api/chat/feedback` from Task 1.
- Produces: none (terminal UI feature).

- [ ] **Step 1: Capture queryLogId in the done handler**

Find the `done` branch in the streaming loop (~line 895):

```js
            } else if (parsed.type === 'done') {
              streamMeta = { sources: parsed.sources || [], hasContext: parsed.hasContext };
```

Replace with (add a `queryLogId` variable declared alongside `streamMeta` earlier in the function — see Step 2):

```js
            } else if (parsed.type === 'done') {
              streamMeta = { sources: parsed.sources || [], hasContext: parsed.hasContext };
              feedbackLogId = parsed.queryLogId || null;
```

- [ ] **Step 2: Declare the feedbackLogId variable**

Locate where `streamMeta` is declared near the top of the send handler (search for `var streamMeta` or `streamMeta =`). Immediately after that declaration add:

```js
    var feedbackLogId = null;
```

If `streamMeta` is not declared with `var` (assigned directly), add `var feedbackLogId = null;` at the start of the same function scope that contains the streaming loop.

- [ ] **Step 3: Add the renderFeedback helper**

Add this function next to `addBadges` (search for `function addBadges`), immediately before it:

```js
  // ─── Feedback thumbs (👍/👎) on completed bot answers ───
  function renderFeedback(inner, logId) {
    if (!logId) return;
    var wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-1 mt-1';

    var up = document.createElement('button');
    up.type = 'button';
    up.title = 'Helpful';
    up.className = 'p-1 rounded-md text-[#c4c9cf] hover:text-green hover:bg-[#f0f6ee] transition-colors';
    up.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/></svg>';

    var down = document.createElement('button');
    down.type = 'button';
    down.title = 'Not helpful';
    down.className = 'p-1 rounded-md text-[#c4c9cf] hover:text-[#d9534f] hover:bg-[#fdf0ef] transition-colors';
    down.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/></svg>';

    var hint = document.createElement('span');
    hint.className = 'text-[10px] text-[#d9534f] ml-1 hidden';
    hint.textContent = 'Try again';

    function lock(chosen) {
      up.disabled = true;
      down.disabled = true;
      if (chosen === 'up') { up.classList.remove('text-[#c4c9cf]'); up.classList.add('text-green'); }
      if (chosen === 'down') { down.classList.remove('text-[#c4c9cf]'); down.classList.add('text-[#d9534f]'); }
    }

    function send(feedback, reason) {
      up.disabled = true; down.disabled = true; hint.classList.add('hidden');
      fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryLogId: logId, feedback: feedback, reason: reason || '' }),
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (data && data.ok) { lock(feedback); }
        else { up.disabled = false; down.disabled = false; hint.classList.remove('hidden'); }
      }).catch(function () {
        up.disabled = false; down.disabled = false; hint.classList.remove('hidden');
      });
    }

    up.onclick = function () { send('up'); };
    down.onclick = function () {
      // Reveal a one-line optional reason input, then submit.
      if (wrap.querySelector('[data-fb-reason]')) return;
      var row = document.createElement('div');
      row.className = 'flex items-center gap-1 mt-1 w-full';
      var input = document.createElement('input');
      input.setAttribute('data-fb-reason', '');
      input.type = 'text';
      input.placeholder = 'What was wrong? (optional)';
      input.className = 'flex-1 text-xs border border-[#e8eaed] rounded-md px-2 py-1 outline-none focus:border-green';
      var go = document.createElement('button');
      go.type = 'button';
      go.textContent = 'Send';
      go.className = 'text-xs px-2 py-1 rounded-md bg-dark text-white hover:opacity-90';
      go.onclick = function () { send('down', input.value); };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { send('down', input.value); } });
      row.appendChild(input); row.appendChild(go);
      wrap.appendChild(row);
      input.focus();
    };

    wrap.appendChild(up);
    wrap.appendChild(down);
    wrap.appendChild(hint);
    inner.appendChild(wrap);
  }
```

- [ ] **Step 4: Call renderFeedback after the stream completes**

Find the post-stream append block (~line 917) where badges + timestamp are added:

```js
      // Append badges + timestamp now that stream is complete
      addBadges(sb.inner, streamMeta);
      var ts = document.createElement('span');
      ts.className = 'text-[10px] text-[#ccc] px-1';
      ts.textContent = formatTimestamp();
      sb.inner.appendChild(ts);
```

Immediately after `sb.inner.appendChild(ts);` add:

```js
      // Feedback thumbs — only when we have a query log id and the answer wasn't stopped
      if (!stopped) {
        renderFeedback(sb.inner, feedbackLogId);
      }
```

- [ ] **Step 5: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 6: Manual verification**

Dev server running, logged in as a student:
1. Ask a question, let it answer. Two thumb icons appear under the answer.
2. Click 👍 → turns green, both disable. Open Supabase → `query_logs` newest row has `feedback = 'up'`.
3. Ask again, click 👎 → reason input appears → type "wrong date" → Send → 👎 turns red, both disable. Row has `feedback = 'down'`, `feedback_reason = 'wrong date'`.
4. Open `/app/admin/analytics` as admin → thumbs-down count incremented, the downvoted query appears in the knowledge-gaps list.
5. Confirm no thumbs render on old history messages after reloading the page (expected — no id tracked).

---

## Notes for Executor

- No commits (standing hold). Leave changes in the working tree.
- If `stopped` is not in scope at the append block, check the surrounding function — it is referenced in the same block for the ticket-offer logic (`if (ticketOffer && !stopped)`), so it is in scope.
- If the exact line numbers have drifted, anchor on the quoted code, not the numbers.
