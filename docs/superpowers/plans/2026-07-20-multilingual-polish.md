# Multilingual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script-range-based language detection in `rag.ts` and a Languages breakdown panel on the admin analytics dashboard.

**Architecture:** Two independent small changes. (1) `detectLanguage()` gains Unicode script-range checks (8 Indic scripts) ahead of an extended romanized keyword fallback — same signature, all callers benefit automatically. (2) `analytics.astro` adds `language` to its select, aggregates counts with the existing Map pattern, and renders a bar list under Top categories, hidden when everything is English.

**Tech Stack:** TypeScript (`rag.ts`), Astro frontmatter + Tailwind (`analytics.astro`).

## Global Constraints

- No migration (`query_logs.language` exists), no new route, no dependency, no cost.
- Do NOT commit — user has a standing "don't commit yet" hold. Skip all `git commit` steps.
- Verification is `npx astro check` (0 errors) + manual flows. No unit-test framework in this repo.
- `detectLanguage` keeps signature `(query: string) => string` and fallback `'english'`.

---

### Task 1: Script-based detection in rag.ts

**Files:**
- Modify: `src/lib/rag.ts` — `LANGUAGE_INDICATORS` const (~line 74) and `detectLanguage()` (~line 78)

**Interfaces:**
- Produces: `detectLanguage(query: string): string` returning one of `'hindi' | 'telugu' | 'tamil' | 'kannada' | 'malayalam' | 'gujarati' | 'bengali' | 'punjabi' | 'english'`. Consumed unchanged by `shouldEscalate` and the escalation path.

- [ ] **Step 1: Replace the indicators + detector**

Find the current code:

```ts
const LANGUAGE_INDICATORS = {
  hindi: ['hindi', 'हिंदी', 'मुझे', 'क्या', 'कैसे', 'है', 'के', 'में'],
  telugu: ['telugu', 'తెలుగు', 'నాకు', 'ఎలా', 'ఎక్కడ', 'ఏమి', 'గురించి'],
};
```

Replace with:

```ts
const LANGUAGE_INDICATORS = {
  hindi: ['hindi', 'हिंदी', 'मुझे', 'क्या', 'कैसे', 'है', 'के', 'में', 'kya', 'kaise', 'mujhe', 'chahiye', 'hai', 'kab', 'kahan'],
  telugu: ['telugu', 'తెలుగు', 'నాకు', 'ఎలా', 'ఎక్కడ', 'ఏమి', 'గురించి', 'naaku', 'ela', 'eppudu', 'ekkada', 'enti', 'kavali'],
};

// Unicode script ranges — a single character match identifies the language.
const SCRIPT_RANGES: Array<[RegExp, string]> = [
  [/[ऀ-ॿ]/, 'hindi'],     // Devanagari
  [/[ఀ-౿]/, 'telugu'],    // Telugu
  [/[஀-௿]/, 'tamil'],     // Tamil
  [/[ಀ-೿]/, 'kannada'],   // Kannada
  [/[ഀ-ൿ]/, 'malayalam'], // Malayalam
  [/[઀-૿]/, 'gujarati'],  // Gujarati
  [/[ঀ-৿]/, 'bengali'],   // Bengali
  [/[਀-੿]/, 'punjabi'],   // Gurmukhi
];
```

Then find the current `detectLanguage`:

```ts
function detectLanguage(query: string): string {
  const lowerQuery = query.toLowerCase();

  for (const [language, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
    if (indicators.some(indicator => lowerQuery.includes(indicator))) {
      return language;
    }
  }

  return 'english';
}
```

Replace with:

```ts
function detectLanguage(query: string): string {
  // Script detection first — one native-script character is decisive
  for (const [range, language] of SCRIPT_RANGES) {
    if (range.test(query)) {
      return language;
    }
  }

  // Romanized keyword fallback (Latin-script Hindi/Telugu)
  const lowerQuery = query.toLowerCase();
  for (const [language, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
    if (indicators.some(indicator => lowerQuery.includes(indicator))) {
      return language;
    }
  }

  return 'english';
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

---

### Task 2: Languages panel in analytics

**Files:**
- Modify: `src/pages/app/admin/analytics.astro` — the `query_logs` select in frontmatter; aggregation after the `topCategories` block; markup inside the Top categories column (`lg:col-span-2`), after the Top categories card

**Interfaces:**
- Consumes: `rows` (now including `language: string | null` per row).
- Produces: `langBreakdown: Array<[string, number]>` and `maxLang: number`, used only by this file's markup.

- [ ] **Step 1: Add language to the select**

Find:

```ts
  .select("id, query, category, had_context, escalated, top_similarity, feedback, reviewed, created_at")
```

Replace with:

```ts
  .select("id, query, category, had_context, escalated, top_similarity, feedback, reviewed, language, created_at")
```

- [ ] **Step 2: Aggregate languages in frontmatter**

Find the end of the top-categories aggregation:

```ts
const topCategories = [...catMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
const maxCat = topCategories[0]?.[1] ?? 1;
```

Insert immediately AFTER it:

```ts
// Language breakdown — hidden when everything is English
const langMap = new Map<string, number>();
for (const r of rows) {
  const lang = r.language || "english";
  langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
}
const hasNonEnglish = [...langMap.keys()].some((l) => l !== "english");
const langBreakdown = hasNonEnglish
  ? [...langMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  : [];
const maxLang = langBreakdown[0]?.[1] ?? 1;
```

- [ ] **Step 3: Render the Languages card**

Find the closing of the Top categories card inside the `lg:col-span-2` column:

```astro
        ) : (
          <p class="text-sm text-[#9aa0a6] py-6 text-center">No data yet.</p>
        )}
      </div>
    </div>
```

Replace with (adds the Languages card after the Top categories card, inside the same column `div`):

```astro
        ) : (
          <p class="text-sm text-[#9aa0a6] py-6 text-center">No data yet.</p>
        )}
      </div>

      {langBreakdown.length > 0 && (
        <div class="mt-6">
          <p class="eyebrow mb-3 !text-[#9aa0a6]">Languages</p>
          <div class="app-card p-5">
            <div class="flex flex-col gap-3.5">
              {langBreakdown.map(([lang, count]) => (
                <div>
                  <div class="flex items-center justify-between text-xs mb-1.5">
                    <span class="font-medium text-dark capitalize">{lang}</span>
                    <span class="text-[#9aa0a6]">{count}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-[#f0f1f3] overflow-hidden">
                    <div class="h-full rounded-full bg-green" style={`width: ${Math.round((count / maxLang) * 100)}%`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
```

- [ ] **Step 4: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 5: Manual verification**

1. Send a Telugu-script chat query → Supabase `query_logs.language = 'telugu'`. Tamil script → `'tamil'`. Romanized "mujhe fees ki jankari chahiye" → `'hindi'`. Plain English → `'english'`.
2. `/app/admin/analytics` → Languages card appears under Top categories with bars; if all logged rows are English, the card is absent.

---

## Notes for Executor

- No commits (standing hold). Leave changes in the working tree.
- Anchor on quoted code, not line numbers.
- The Top categories card markup appears once in the file; the `No data yet.` fallback string is unique to it.
