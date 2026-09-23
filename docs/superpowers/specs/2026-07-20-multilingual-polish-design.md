# Multilingual Polish — Spec

**Status:** Approved
**Date:** 2026-07-20
**Feature:** #4 (final) of the DeskMate scale-up backlog

## Problem

1. `detectLanguage()` in `src/lib/rag.ts` uses only a tiny keyword list (Hindi + Telugu). Native-script queries using words outside the list, romanized queries, and every other Indian language fall through to `english`. This mislabels `query_logs.language` and weakens escalation staff language-matching. (The *answer* language is fine — the LLM handles that independently via prompt rule 10.)
2. The analytics dashboard never shows the `language` column, so admins can't see how many students ask in which language.

## Part 1 — Script-based detection (`src/lib/rag.ts`)

Rewrite `detectLanguage(query)` to check, in order:

1. **Unicode script ranges** (any single character match wins; checked in this order):
   | Range | Language |
   |---|---|
   | `ऀ-ॿ` (Devanagari) | `hindi` |
   | `ఀ-౿` (Telugu) | `telugu` |
   | `஀-௿` (Tamil) | `tamil` |
   | `ಀ-೿` (Kannada) | `kannada` |
   | `ഀ-ൿ` (Malayalam) | `malayalam` |
   | `઀-૿` (Gujarati) | `gujarati` |
   | `ঀ-৿` (Bengali) | `bengali` |
   | `਀-੿` (Gurmukhi) | `punjabi` |
2. **Romanized keyword fallback** (Latin-script Hindi/Telugu). Keep the existing `LANGUAGE_INDICATORS` entries and extend with common romanized words:
   - hindi: add `kya`, `kaise`, `mujhe`, `chahiye`, `hai`, `kab`, `kahan`
   - telugu: add `naaku`, `ela`, `eppudu`, `ekkada`, `enti`, `kavali`
3. Fallback: `english`.

No signature change — still `(query: string) => string`. All existing callers (`shouldEscalate`, escalation staff matching, query logging) benefit automatically.

## Part 2 — Language breakdown in analytics (`src/pages/app/admin/analytics.astro`)

- Add `language` to the existing `query_logs` select.
- Aggregate counts per language over the fetched rows (same `Map` pattern as top categories).
- Render a **"Languages"** bar list under the existing Top categories card (inside the same left column), same bar style, capitalized labels, top 6. Hide the section entirely when every row is `english` (breakdown adds nothing).

## Files

- Modify: `src/lib/rag.ts` — `detectLanguage()` + `LANGUAGE_INDICATORS` only.
- Modify: `src/pages/app/admin/analytics.astro` — select + aggregation + one small panel.

No migration (`query_logs.language` exists), no new route, no dependency, no cost.

## Out of Scope (YAGNI)

- Changing answer-language behavior (already handled by prompt rule 10).
- Voice input languages (English-only per the audio-input spec).
- Romanized detection for languages beyond Hindi/Telugu.
- Storing anything new.

## Verification

- `npx astro check` → 0 errors.
- Manual: send a Telugu-script query → `query_logs.language = 'telugu'`; Tamil script → `'tamil'`; romanized "mujhe fees ki jankari chahiye" → `'hindi'`; plain English → `'english'`.
- Manual: `/app/admin/analytics` shows a Languages bar list when non-English queries exist; hidden when all rows are English.
