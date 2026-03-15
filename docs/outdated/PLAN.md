# Writing Process Recorder Implementation Plan

Date: 2026-03-13

## 1) Scope and Goal

Build a fully local, browser-only application with **two connected web pages**:

1. `index.html` (Compose page): user writes text, records events, exports JSON, imports JSON.
2. `replay.html` (Replay page): user replays the writing process from recorded events.

The two pages are connected by navigation buttons:

- Compose page has a `Go to Replay` button.
- Replay page has a `Back to Compose` button.

No backend, no account system, no server storage.

---

## 2) Proposed File Structure

Create the following files:

```
index.html
replay.html
styles/
  base.css
js/
  model.js
  compose.js
  replay.js
README.md (optional quick usage notes)
```

### File responsibilities

- `index.html`
  - Plain text editor (`<textarea>`)
  - Buttons: Save JSON, Import JSON, Undo, Go to Replay
  - Loads `js/model.js` and `js/compose.js`
- `replay.html`
  - Replay display area (`<pre>` or read-only `<textarea>`)
  - Controls: Play, Pause, Speed selector, Back to Compose
  - Loads `js/model.js` and `js/replay.js`
- `styles/base.css`
  - Shared layout, spacing, typography, responsive behavior
- `js/model.js`
  - Shared data structures and pure functions (apply events, validate, serialize)
- `js/compose.js`
  - Event capture, compression, undo behavior, import/export, temporary session storage for handoff
- `js/replay.js`
  - Playback scheduler and UI control wiring

---

## 3) Data Model (JSON Contract)

Use this session schema (versioned):

```json
{
  "version": 1,
  "startTime": 1710316800000,
  "finalText": "Hello world",
  "events": [
    {"t": 120, "type": "insert", "pos": 0, "text": "Hello"},
    {"t": 420, "type": "insert", "pos": 5, "text": " world"}
  ]
}
```

### Event definitions

- Insert event
  - Required: `t`, `type="insert"`, `pos`, `text`
- Delete event
  - Required: `t`, `type="delete"`, `pos`, `length`

### Timing convention

- `startTime`: absolute epoch milliseconds when session starts.
- `t`: elapsed milliseconds from `startTime`.

---

## 4) Core Algorithms

## 4.1 Apply operations

- Insert:
  - `text = text.slice(0, pos) + inserted + text.slice(pos)`
- Delete:
  - `text = text.slice(0, pos) + text.slice(pos + length)`

Add bounds checks:

- Clamp or reject invalid `pos`/`length`.
- Prefer strict validation during import; reject malformed files with clear message.

## 4.2 Replay reconstruction

- Start from empty string.
- Apply events sequentially.
- After all events, verify reconstructed text matches `finalText` (warning if mismatch).

## 4.3 Event compression rules

Merge only when all are true:

- both events are `insert`
- continuous position (`prev.pos + prev.text.length === curr.pos`)
- time gap <= threshold (recommend 300 ms)
- current insert is not paste and not newline

Force new event when:

- delete operation
- paste input
- text contains `\n`
- selection replacement occurred
- insertion position is not continuous

---

## 5) Compose Page Technical Plan (`index.html` + `compose.js`)

## 5.1 UI elements

- `textarea#editor`
- `button#undoBtn`
- `button#saveBtn`
- `input#importFile` (accept `.json`)
- `button#toReplayBtn`
- `div#status`

## 5.2 Capture strategy

Track editor state before and after each edit:

- Keep `prevText`, `prevSelectionStart`, `prevSelectionEnd`.
- On `input` event, derive minimal diff to generate either:
  - one `insert` event, or
  - one `delete` event, or
  - delete + insert for replacement (two events, same timestamp allowed)

Use `event.inputType` to identify paste/delete where available.

## 5.3 Undo behavior

- Maintain in-memory `events` stack.
- On Undo button:
  - pop last event
  - recompute full text by replaying remaining events from empty string
  - set editor text to recomputed result
- Do not log `undo` as an event.

## 5.4 Export/Import

- Export:
  - Build session JSON from current state
  - `Blob` + `URL.createObjectURL` + download link click
- Import:
  - Read local file via `FileReader`
  - Validate schema and events
  - Restore `events` and `finalText` into editor
  - Continue appending new events after import

## 5.5 Page connection to Replay

- `Go to Replay` button behavior:
  - Save current session JSON to `localStorage` key, e.g. `wpr:lastSession`
  - Navigate to `replay.html`

This avoids requiring export/import for immediate replay.

---

## 6) Replay Page Technical Plan (`replay.html` + `replay.js`)

## 6.1 UI elements

- `pre#replayText`
- `button#playBtn`
- `button#pauseBtn`
- `select#speedSelect` (`1`, `2`, `5`, `10`, `20`, `50`; default `5`)
- `button#backBtn`
- `input#replayImportFile` (optional direct import)

## 6.2 Session load priority

1. Load from `localStorage[wpr:lastSession]` if present.
2. Otherwise allow user to import JSON manually.

## 6.3 Playback engine

- State: `isPlaying`, `cursor`, `currentText`, `timerId`, `speed`.
- On Play:
  - if first run: reset to empty text, `cursor=0`
  - schedule next event using mapped delta time:
    - `rawGap = events[i].t - events[i-1].t`
    - if `rawGap <= 10s`, `mappedGap = rawGap`
    - if `rawGap > 10s` and `< 10min`, `mappedGap = 10s`
    - if `rawGap >= 10min`, `mappedGap = 20s`
    - `delay = mappedGap / speed`
  - apply event, render text, increment cursor, schedule next
- On Pause:
  - clear pending timer, keep current state

## 6.4 Back navigation

- `Back to Compose` button navigates to `index.html`.
- Compose page reads `wpr:lastSession` on load to restore working session quickly.

---

## 7) Validation and Error Handling

- Validate imported JSON:
  - required top-level fields exist
  - `events` is array
  - each event has required fields by type
  - numeric fields are finite and non-negative where applicable
- Handle invalid file with user-friendly message in `#status`.
- Handle replay mismatch (`reconstructed !== finalText`) with warning but keep replay available.

---

## 8) Performance Strategy

- Keep replay apply operation O(1) per event (string slicing cost unavoidable in JS; acceptable for target sizes).
- Avoid full recomputation during normal typing (only on undo/import/validation).
- Optional optimization for very large logs:
  - precompute checkpoint text every N events (e.g., every 1000) for faster jumps/resume.

---

## 9) Cross-Browser and Local Usage

- Use only standard browser APIs: DOM, FileReader, Blob, localStorage, setTimeout.
- Test on Chrome, Edge, Firefox, Safari.
- Ensure app works when opened directly as local files (`file://`).

---

## 10) Implementation Milestones

1. Scaffold files and shared CSS.
2. Implement `model.js` pure event functions and JSON validation.
3. Build compose page recording + compression + undo.
4. Add export/import and localStorage handoff.
5. Build replay page controls and timed playback.
6. Connect both pages with navigation buttons.
7. Run manual test scenarios and polish UX/status messages.

---

## 11) Acceptance Checklist

- Two pages exist and are connected both directions by buttons.
- Compose page supports writing, undo, JSON export, JSON import.
- Replay page plays from empty text using event timestamps with speed control.
- Imported sessions can continue recording new events.
- No backend/network dependency for core operation.
- App runs offline and from local file open.
