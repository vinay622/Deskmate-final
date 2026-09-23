# Feedback Thumbs in Chat — Design Spec

**Date:** 2026-07-20
**Status:** Approved, ready for implementation planning
**Feature:** 1 of 4 (feedback thumbs → audio input → analytics document suggestions → multilingual polish)

## Goal

Add 👍/👎 buttons to each completed bot message in the chat. Clicking writes `feedback` (`'up'`/`'down'`, plus optional reason) to that query's `query_logs` row. This lights up the existing admin analytics dashboard, whose thumbs-down count and knowledge-gap list currently read a column that is never populated.

## Context / Why This Is Small

Server-side plumbing already exists:

- `generate.ts` inserts a `query_logs` row per query and captures `queryLogId` (line 79–101).
- `queryLogId` is already passed into the stream generator and emitted in the `done` SSE event (`rag.ts` line 632, 508, 803). The client currently **ignores** it.
- RLS policy `"Users update own query logs"` already allows an authenticated student to update their own log row (migration `20260717000000_scale_features.sql` line 37–41).
- `query_logs.feedback` has `CHECK (feedback IN ('up','down'))`; `feedback_reason TEXT` already exists.

So no migration is required. Work is client-side rendering/handler + one new API route.

## Components

### 1. Capture the query log id (client)

In the `done` handler of the streaming loop (`ChatInterface.astro` ~line 895), store `parsed.queryLogId` alongside `streamMeta`. Keep it in a local variable scoped to the current bot turn.

### 2. Render thumbs (client)

After the stream completes — where badges + timestamp are appended (~line 917) — if a non-null `queryLogId` is present, append two ghost icon-buttons (👍 / 👎) into the message's inner container, next to the timestamp.

- Only on assistant messages.
- Only on **live** messages (just streamed). Re-rendered history messages have no id tracked in memory and get no thumbs. This is intentional (YAGNI) — feedback is a fresh-answer signal.

### 3. Interaction (client)

- Click 👍 → POST `{ queryLogId, feedback: 'up' }`.
- Click 👎 → reveal a single optional one-line reason input; POST `{ queryLogId, feedback: 'down', reason }` on submit (reason may be empty).
- On success: chosen thumb turns solid green, both buttons disabled (feedback is final per message).
- On network error: re-enable buttons, show a small inline "try again" hint.

### 4. New endpoint: `POST /api/chat/feedback`

- Body: `{ queryLogId: string, feedback: 'up' | 'down', reason?: string }`.
- Auth required (authenticated Supabase server client).
- Validate `feedback ∈ {'up','down'}`; reject otherwise with 400.
- Update `query_logs` set `feedback`, `feedback_reason` where `id = queryLogId`. RLS enforces own-row ownership.
- Return `{ ok: true }` or `{ ok: false, error }`.
- Mirrors the existing pattern in `src/pages/api/admin/analytics/[id].ts`.

## Data Flow

```
student clicks 👍/👎
  → POST /api/chat/feedback { queryLogId, feedback, reason? }
    → supabase.from('query_logs').update({ feedback, feedback_reason }).eq('id', queryLogId)
      → RLS: user_id = auth.uid()
        → admin analytics page now counts thumbs-down + lists downvoted gaps
```

## Error Handling / Edge Cases

- **No `queryLogId`** (log insert failed upstream): no thumbs rendered; chat unaffected.
- **Escalation / announcement answers**: still receive a log id, so they are ratable too.
- **Double submit**: buttons disable after first success; feedback is final.
- **Invalid feedback value**: API returns 400, client shows retry hint.

## Testing

- `astro check` passes with 0 errors.
- Manual: ask a question → 👍 turns green, both disable → refresh analytics, thumbs-up not counted as down. Ask again → 👎 + reason → analytics thumbs-down count increments and query appears in knowledge-gaps list.
- Manual: simulate log-insert failure path (no id) → no thumbs, no console errors.

## Files Touched

- Modify: `src/components/chat/ChatInterface.astro` (capture id, render thumbs, click handler)
- Create: `src/pages/api/chat/feedback.ts`
- No migration.

## Out of Scope

- Rating re-rendered history messages.
- Changing analytics aggregation (already reads `feedback`).
- Editing/undoing feedback after submit.
