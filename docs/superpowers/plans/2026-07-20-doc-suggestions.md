# Analytics Document-Need Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cluster recurring knowledge gaps into "students keep asking about X — upload a doc" suggestions on the analytics dashboard.

**Architecture:** Pure server-side aggregation in the existing `analytics.astro` frontmatter, reusing the up-to-1000 `query_logs` rows already fetched. A keyword-grouping helper produces topic suggestions; one new panel renders them. No new API call, no LLM, no client JS, no schema change.

**Tech Stack:** Astro frontmatter (TypeScript), Tailwind.

## Global Constraints

- Free-tier only: no new API call, no LLM, no npm dependency, no schema change.
- Server-side only: all logic in `analytics.astro` frontmatter; no client JS added.
- Do NOT commit — user has a standing "don't commit yet" hold. Skip all `git commit` steps.
- Verification is `npx astro check` (0 errors) + manual browser flow. No unit-test framework for Astro page code.
- Upload button links to `/app/admin/documents` with NO query param (that page reads none).
- Match existing frontmatter style (`const`, arrow helpers, `Map`) already used in this file.

---

### Task 1: Clustering helper + suggestions panel

**Files:**
- Modify: `src/pages/app/admin/analytics.astro` (frontmatter after line 42, the `gaps` const; markup — insert a panel before the `grid lg:grid-cols-5` block at line 84)

**Interfaces:**
- Consumes: existing `rows` array (each row has `query: string`, `category: string | null`, `had_context: boolean`, `feedback: string | null`).
- Produces: `suggestions` — `Array<{ topic: string; count: number; samples: string[] }>`, sorted by count desc, only `count >= 2`, max 6. Consumed by the markup panel in the same file.

- [ ] **Step 1: Add the clustering helper to frontmatter**

Insert immediately AFTER the `gaps` const (line 42) and BEFORE the closing `---` (line 43):

```ts
// Document-need suggestions: cluster gap queries by keyword/category
const KNOWN_KEYWORDS = [
  "fees", "hostel", "scholarship", "exam", "admission", "library",
  "timetable", "result", "certificate", "placement", "attendance", "refund",
];

const gapRows = rows.filter((r) => !r.had_context || r.feedback === "down");

type Suggestion = { topic: string; count: number; samples: string[] };
const topicMap = new Map<string, Suggestion>();

for (const r of gapRows) {
  const q = (r.query || "").toLowerCase();
  let topic: string | null = KNOWN_KEYWORDS.find((k) => q.includes(k)) ?? null;
  if (!topic) {
    const cat = r.category;
    if (cat && cat !== "uncategorized") {
      topic = cat;
    }
  }
  if (!topic) continue;

  const existing = topicMap.get(topic);
  if (existing) {
    existing.count += 1;
    if (existing.samples.length < 2 && r.query) {
      existing.samples.push(r.query.trim());
    }
  } else {
    topicMap.set(topic, { topic, count: 1, samples: r.query ? [r.query.trim()] : [] });
  }
}

const suggestions = [...topicMap.values()]
  .filter((s) => s.count >= 2)
  .sort((a, b) => b.count - a.count)
  .slice(0, 6);
```

- [ ] **Step 2: Add the suggestions panel to markup**

Insert BETWEEN the closing `</div>` of the stat-tiles block (line 82) and the `<div class="grid lg:grid-cols-5 gap-6">` line (line 84):

```astro
  <!-- Suggested documents to upload -->
  <div class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <p class="eyebrow !text-[#9aa0a6]">Suggested documents to upload</p>
      {suggestions.length > 0 && <span class="text-xs text-[#9aa0a6]">{suggestions.length} topics</span>}
    </div>
    {suggestions.length > 0 ? (
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {suggestions.map((s) => (
          <div class="app-card p-4 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-dark capitalize">{s.topic}</span>
                <span class="chip chip-amber shrink-0">{s.count} students asked</span>
              </div>
              <div class="mt-2 flex flex-col gap-1">
                {s.samples.map((q) => (
                  <p class="text-xs text-[#9aa0a6] leading-snug truncate">“{q}”</p>
                ))}
              </div>
            </div>
            <a
              href="/app/admin/documents"
              class="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-green hover:underline"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload doc
            </a>
          </div>
        ))}
      </div>
    ) : (
      <div class="app-card px-5 py-10 text-center">
        <p class="text-sm text-[#9aa0a6]">No recurring gaps yet — suggestions appear once several students ask about the same topic.</p>
      </div>
    )}
  </div>
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 4: Manual verification**

As admin, load `/app/admin/analytics`:
1. With gap data present, the "Suggested documents to upload" panel appears above the Top categories / Knowledge gaps grid.
2. Topics group by keyword (e.g. queries containing "hostel" cluster under **Hostel**), count reflects total gap rows for that topic, up to 2 sample queries show in quotes.
3. Only topics with 2+ queries appear; at most 6 cards.
4. "Upload doc" navigates to `/app/admin/documents`.
5. When no topic reaches 2, the empty-state message renders instead.

---

## Notes for Executor

- No commits (standing hold). Leave changes in the working tree.
- If line numbers have drifted, anchor on the quoted code (the `gaps` const for frontmatter; the stat-tiles closing `</div>` + `grid lg:grid-cols-5` for markup).
- `chip chip-amber` is an existing class already used in the gaps list — reuse it, don't invent new chip styles.
