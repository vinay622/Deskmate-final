# Audio Input (Voice Queries) — Design Spec

**Date:** 2026-07-20
**Feature:** Voice-to-text input for the student chat
**Status:** Approved, ready for planning

## Goal

Let students dictate their question instead of typing. A mic button in the chat input box transcribes speech into the existing textarea using the browser's built-in speech recognition. Voice fills the input only — it never auto-sends, so students can correct mis-hears before sending.

## Decisions (locked)

- **Engine:** Browser Web Speech API (`window.SpeechRecognition || window.webkitSpeechRecognition`). Free-tier only — no backend route, no API key, no npm dependency, no per-minute cost.
- **Language:** English only, `lang = 'en-IN'`. No language picker. (Regional-language voice via a Whisper fallback is explicitly deferred to a future iteration.)
- **No auto-send:** transcript populates `#chat-input`; the student reviews and taps send.

## Scope

In:
- Mic button in the chat input row, left of the send button.
- Live (interim) transcription streaming into the textarea as the student speaks.
- Three visual states: idle, listening (pulse), unsupported (hidden).
- Graceful handling of permission-denied, no-speech, and network errors.

Out (YAGNI):
- Waveform visualization.
- Multi-language / language picker.
- Auto-send after speech.
- Backend transcription (Whisper).

## Behavior

1. Tap mic → browser prompts for mic permission (first time) → recognition starts; button switches to **listening** state, placeholder becomes "Listening…".
2. `interimResults = true` streams partial text into `#chat-input`; existing auto-resize + input handlers fire so the box grows normally.
3. Tap mic again → stop. Also auto-stops on silence / recognizer `end`. Button returns to **idle**, placeholder restored.
4. Final transcript is set as the textarea value. Student edits if needed, then sends via the normal send button / Enter.
5. `continuous = false` so a natural pause ends the session.

## States

| State | Trigger | UI |
|-------|---------|-----|
| Idle | default / after stop / after error | Outline mic, muted grey (`text-[#c4c9cf]`) |
| Listening | mic tapped, recognition active | Red mic (`text-[#d9534f]`) with pulse animation; placeholder "Listening…" |
| Unsupported | `SpeechRecognition` undefined | Button not rendered at all; typing unaffected |

## Error handling

- Permission denied (`error === 'not-allowed'` / `'service-not-allowed'`) → return to idle, restore placeholder, show a tiny inline hint "Mic access blocked" near the input for a few seconds.
- `no-speech` / `aborted` / `network` → silently return to idle, restore placeholder. No crash, no stuck listening state.
- Guard against double-start with an `isListening` flag.

## Files

- Modify: `src/components/chat/ChatInterface.astro`
  - Add mic button markup in the send-button row (~line 225).
  - Add a pulse `@keyframes` + `.mic-listening` style in the `<style>` block.
  - Add a self-contained `initVoiceInput()` inline-script block, wired alongside the existing send/keydown listeners. Match the file's `var` + `function` client-JS style.

No new route, no schema change, no `package.json` change.

## Verification

- `npx astro check` → 0 errors.
- Manual (Chrome/Edge): mic appears; tap → permission prompt → speak → text appears live; tap again → stops; edit + send works.
- Manual: deny permission → inline hint, no stuck state.
- Manual (Firefox/Safari): mic button absent, typing works.
