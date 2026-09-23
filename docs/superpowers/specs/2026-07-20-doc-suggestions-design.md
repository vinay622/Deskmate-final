# Analytics Document-Need Suggestions — Spec

**Status:** Approved
**Date:** 2026-07-20
**Feature:** #3 of the DeskMate scale-up backlog

## Problem

The analytics dashboard lists individual knowledge gaps (unanswered or downvoted queries) one by one, but never tells the admin *what to do* about them. Admins can't see that 6 different students all asked about hostel fees — they just see 6 separate gap rows. We want to cluster recurring gaps into actionable "students keep asking about X — upload a doc" recommendations.

## Approach

Pure server-side aggregation in the existing `src/pages/app/admin/analytics.astro` frontmatter, reusing the up-to-1000 `query_logs` rows already fetched. Free-tier keyword grouping — no new API call, no LLM, no schema change, no client JS.

## Data Source

Reuse the existing `rows` array. Define the suggestion input as gap rows:

```
gapRows = rows where (!had_context || feedback === 'down')
```

Note: this is NOT limited to `!reviewed` and NOT sliced to 50 — the full gap volume drives the counts, so a topic reflects real demand even if some individual rows were marked reviewed.

## Clustering Logic (new frontmatter helper)

Known domain keywords (checked as substrings of the lowercased query, in this priority order):

```
fees, hostel, scholarship, exam, admission, library, timetable,
result, certificate, placement, attendance, refund
```

For each gap row, derive a **topic key**:
1. If the lowercased query contains one of the known keywords → that keyword is the topic. (First match wins, in the order listed above.)
2. Else if `category` is present and not `"uncategorized"` → use `category`.
3. Else → skip the row (do not force weak groupings into "other").

Tally rows per topic. For each topic keep:
- `count` (number of gap rows)
- up to 2 sample queries (first 2 encountered, trimmed)

Sort topics by `count` descending. Keep topics with `count >= 2`. Show top 6.

## UI

New panel titled **"Suggested documents to upload"**, placed above the existing "Top categories" / "Knowledge gaps" grid (full width).

Each suggestion row shows:
- Topic name, capitalized (e.g. **Hostel**)
- Count badge: `{count} students asked`
- Up to 2 sample queries in muted text
- An **"Upload doc"** button linking to `/app/admin/documents` (no query param — that page reads none)

Empty state (no topic reaches count ≥ 2):
> "No recurring gaps yet — suggestions appear once several students ask about the same topic."

## Files

- Modify: `src/pages/app/admin/analytics.astro` — clustering helper in frontmatter + one panel in markup. No route, no client JS, no migration.

## Out of Scope (YAGNI)

- LLM topic naming
- Persisting suggestions or dismiss/track state (topics drop off naturally as docs are added and gaps stop appearing)
- Query-param prefill on the documents page (page supports none)
- Any change to the mark-reviewed flow

## Verification

- `npx astro check` → 0 errors
- Manual: as admin, load `/app/admin/analytics`; with seeded gap data, confirm topics group correctly, counts are right, samples show, "Upload doc" navigates to documents, and the empty state renders when no topic hits count ≥ 2.
