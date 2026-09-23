# Audio Input (Voice Queries) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mic button to the chat input that transcribes English speech into the textarea using the browser's built-in Web Speech API, without auto-sending.

**Architecture:** Purely client-side, single file. A mic button sits left of the send button. Tapping it starts `SpeechRecognition` (`lang='en-IN'`, `interimResults=true`, `continuous=false`); interim text streams into `#chat-input` live. Tapping again or a natural pause stops it. No backend, no npm dependency, no schema change. If the browser lacks `SpeechRecognition`, the button is never rendered.

**Tech Stack:** Vanilla client JS (inline `<script>` in `.astro`), Web Speech API, Tailwind.

## Global Constraints

- Free-tier only: no backend route, no API key, no npm dependency, no `package.json` change.
- English only: `recognition.lang = 'en-IN'`. No language picker.
- No auto-send: transcript populates `#chat-input`; the student sends manually.
- Do NOT commit — user has a standing "don't commit yet" hold. Skip all `git commit` steps.
- Verification is `npx astro check` (0 errors) + manual browser flow. No unit-test framework for chat client code.
- Client JS style in `ChatInterface.astro` is ES5-ish `var` + `function`; match it — no `const`/arrow in the inline script.
- Unsupported browsers: hide the button entirely, never show-but-broken.

---

### Task 1: Mic button markup + listening style

**Files:**
- Modify: `src/components/chat/ChatInterface.astro` (send-button row ~line 225; `<style>` block ~line 242)

**Interfaces:**
- Produces: a `<button id="mic-btn">` (hidden by default via `hidden` class, revealed by Task 2 when supported) and a `.mic-listening` CSS class with a pulse animation, consumed by Task 2.

- [ ] **Step 1: Add the mic button left of the send button**

Find the send-button row (~line 224-232):

```html
          <!-- Send button (inside box, bottom-right) -->
          <div class="flex items-center justify-end px-3 pb-2.5">
            <button
              id="send-btn"
              class="w-9 h-9 rounded-[12px] bg-dark hover:bg-[#2d2e3a] text-white flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
            </button>
          </div>
```

Replace with (adds mic button + a spacer that pushes send to the right; mic starts `hidden`):

```html
          <!-- Mic + Send buttons (inside box, bottom) -->
          <div class="flex items-center justify-between px-3 pb-2.5">
            <div class="flex items-center gap-2">
              <button
                id="mic-btn"
                type="button"
                title="Speak your question"
                class="hidden w-9 h-9 rounded-[12px] text-[#c4c9cf] hover:text-dark hover:bg-[#eef0f3] flex items-center justify-center transition-all duration-200"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
              <span id="mic-hint" class="text-[10px] text-[#d9534f] hidden">Mic access blocked</span>
            </div>
            <button
              id="send-btn"
              class="w-9 h-9 rounded-[12px] bg-dark hover:bg-[#2d2e3a] text-white flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
            </button>
          </div>
```

- [ ] **Step 2: Add the pulse style**

Find the `<style>` block opening (~line 242, `#chat-input { overflow-y: hidden; }`). Immediately after that line add:

```css
  @keyframes micPulse {
    0%   { box-shadow: 0 0 0 0 rgba(217, 83, 79, 0.45); }
    70%  { box-shadow: 0 0 0 8px rgba(217, 83, 79, 0); }
    100% { box-shadow: 0 0 0 0 rgba(217, 83, 79, 0); }
  }
  .mic-listening {
    color: #d9534f !important;
    animation: micPulse 1.4s infinite;
  }
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 4: Manual check (button hidden)**

Load the chat page. The mic button is NOT visible yet (still `hidden` — Task 2 reveals it). Send button still sits bottom-right. Typing + send still work.

---

### Task 2: Voice recognition wiring

**Files:**
- Modify: `src/components/chat/ChatInterface.astro` (Events section ~line 1067-1068)

**Interfaces:**
- Consumes: `#mic-btn`, `#mic-hint`, `#chat-input` from Task 1; `.mic-listening` class from Task 1.
- Produces: none (terminal UI feature).

- [ ] **Step 1: Add initVoiceInput and call it**

Find the Events section (~line 1067):

```js
  // ─── Events ───
  document.getElementById('send-btn').addEventListener('click', function() { handleSend(); });
```

Insert the following BETWEEN the `// ─── Events ───` comment and the `send-btn` line (so it runs during the same init):

```js
  // ─── Voice input (Web Speech API, English, no auto-send) ───
  function initVoiceInput() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var micBtn = document.getElementById('mic-btn');
    if (!SR || !micBtn) return; // Unsupported → leave button hidden

    micBtn.classList.remove('hidden'); // Supported → reveal

    var input = document.getElementById('chat-input');
    var hint = document.getElementById('mic-hint');
    var recognition = new SR();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;

    var isListening = false;
    var baseText = '';

    function setIdle() {
      isListening = false;
      micBtn.classList.remove('mic-listening');
      input.setAttribute('placeholder', 'Type your question...');
    }

    function setListening() {
      isListening = true;
      hint.classList.add('hidden');
      micBtn.classList.add('mic-listening');
      input.setAttribute('placeholder', 'Listening…');
    }

    micBtn.addEventListener('click', function () {
      if (isListening) {
        recognition.stop();
        return;
      }
      baseText = input.value ? input.value + ' ' : '';
      try {
        recognition.start();
      } catch (e) {
        // start() throws if called too soon after a previous stop; ignore
      }
    });

    recognition.onstart = function () { setListening(); };

    recognition.onresult = function (event) {
      var transcript = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      input.value = baseText + transcript;
      // Trigger the existing auto-resize handler
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    };

    recognition.onerror = function (event) {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        hint.classList.remove('hidden');
        setTimeout(function () { hint.classList.add('hidden'); }, 4000);
      }
      setIdle();
    };

    recognition.onend = function () { setIdle(); };
  }
  initVoiceInput();

```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Manual verification (Chrome/Edge)**

1. Load chat. Mic button now visible, left of send, muted grey.
2. Tap mic → browser permission prompt → allow. Mic turns red + pulses, placeholder shows "Listening…".
3. Speak "when are the exams" → words appear live in the textarea; box grows if long.
4. Pause / tap mic again → pulse stops, placeholder restored. Text remains, NOT auto-sent.
5. Edit text, tap send → sends normally.
6. Tap mic with existing typed text → new speech appends after a space (doesn't wipe typed text).

- [ ] **Step 4: Manual verification (permission denied)**

Reload, tap mic, **deny** permission → red "Mic access blocked" hint appears for ~4s, mic returns to idle, no stuck listening state, typing still works.

- [ ] **Step 5: Manual verification (unsupported browser)**

Open the chat in Firefox or Safari → mic button is absent entirely; typing + send unaffected.

---

## Notes for Executor

- No commits (standing hold). Leave changes in the working tree.
- If exact line numbers have drifted, anchor on the quoted code, not the numbers.
- `webkitSpeechRecognition` is untyped in TS — `window.SpeechRecognition || window.webkitSpeechRecognition` may raise a TS hint about `webkitSpeechRecognition` not existing on `window`. If `npx astro check` reports an ERROR (not hint) for it, cast via `(window as any)` in that one expression: `var SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;`. Only apply if it's a hard error.
