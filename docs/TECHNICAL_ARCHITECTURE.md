# Writing Process Recorder Technical Architecture and Implementation

This document is intended for technical readers. It explains the system architecture, core algorithms, and implementation details based on the current repository code (`index.html`, `replay.html`, `js/*.js`, `styles/base.css`).

## 1. System Positioning and Overall Architecture

- **Architecture style**: Pure frontend application with no build step, no backend, and no database; runs directly in the browser.
- **Execution boundary**: All state and data stay on the user side (memory, `localStorage`, and user-managed JSON import/export files).
- **Page split**:
  - `index.html`: composing and recording (Compose).
  - `replay.html`: playback and inspection (Replay).
- **Shared layer**:
  - `js/model.js`: event model, replay logic, and session validation (pure-function core).
  - `js/theme.js`: theme synchronization (query/localStorage/window.name/system theme).
  - `styles/base.css`: shared UI styles and responsive layout.

From a responsibility perspective, this is a lightweight **two-page + shared-model** frontend architecture: pages handle interaction, the model guarantees data correctness, and browser APIs provide persistence and file exchange.

## 2. Directory and Module Responsibilities

### 2.1 Page Layer

- `index.html`
  - Provides `textarea#editor` for writing.
  - Provides controls: Undo / New Session / Save JSON / Import JSON / Go to Replay.
  - Runs an inline script early to set `data-theme` and avoid theme flash.
  - Load order: `js/theme.js` -> `js/model.js` -> `js/compose.js`.

- `replay.html`
  - Provides `pre#replayText` as replay output.
  - Provides controls: Play / Pause / Speed / Import JSON / Back to Compose.
  - Provides `input#progressBar[type=range]` for progress scrubbing.
  - Also sets theme early via inline script.
  - Load order: `js/theme.js` -> `js/model.js` -> `js/replay.js`.

### 2.2 Logic Layer

- `js/model.js`
  - `applyEvent(text, event)`: applies one `insert` or `delete` event.
  - `replayEvents(events)`: replays events from an empty string to reconstruct text.
  - `validateSession(session)`: validates JSON schema and replay consistency.
  - `buildSession(params)`: builds a versioned session payload.

- `js/compose.js`
  - Listens to editor input and derives events from minimal text diff.
  - Compresses continuous input (300ms window + contiguous position + non-paste/non-newline/non-replacement).
  - Maintains undo groups (`actionSizes`) and performs logical undo.
  - Handles JSON import/export, local autosave, and navigation to replay page.

- `js/replay.js`
  - Loads and validates sessions (local cache first, manual import can override).
  - Replays events with time-gap scheduling, speed control, and pause.
  - Supports progress bar seek (`events.slice(0, cursor)` reconstruction).
  - Updates status and metrics (event count, cursor, percentage).
  - Computes replay-side statistics from existing events (no JSON schema change).

- `js/theme.js`
  - Theme priority: query param -> `window.name` -> `localStorage` -> system theme.
  - Theme switch writes to both `localStorage` and `window.name`.
  - Cross-tab sync via `storage` event.
  - Theme can be passed during navigation via query param; later removed from URL (`history.replaceState`).

### 2.3 Style Layer

- `styles/base.css`
  - Uses CSS variables for both light and dark themes.
  - Defines shared panel/control/editor presentation.
  - Uses media queries for mobile responsiveness.

## 3. Data Model and Constraints

### 3.1 Session Structure

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

- `version`: format version (currently fixed to `1`).
- `startTime`: absolute session start time (epoch milliseconds).
- `finalText`: final text at session end.
- `events`: ordered edit-event stream.

### 3.2 Event Structure

- `insert`: `{ t, type: "insert", pos, text }`
- `delete`: `{ t, type: "delete", pos, length }`

Validation rules in `model.js` include:
- `t` must be a non-negative finite number.
- `pos` must be a non-negative integer.
- `insert.text` must be a string.
- `delete.length` must be a non-negative integer.
- The full event sequence must be replayable, and replayed output must match `finalText`.

## 4. Compose Pipeline (Recording)

Key state in `compose.js`:
- `events`: final event log.
- `actionSizes`: number of events produced per user action (1 or 2), used for undo.
- `prevText`: previous editor text snapshot.
- `sessionStartTime`: session origin used to compute elapsed `t`.
- `pendingInputMeta`: metadata captured in `beforeinput` (inputType/selection).

### 4.1 Converting Input to Events

In the `input` handler:
1. Compare `prevText` and `nextText`.
2. Use `commonPrefixLength` / `commonSuffixLength` to isolate the minimal change window.
3. Derive `deletedText` and `insertedText`.
4. Under the same timestamp `t = Date.now() - sessionStartTime`:
   - emit `delete` if deletion exists,
   - emit `insert` if insertion exists.

This covers standard typing, deletion, replacement, and paste without tracking cursor movement path.

### 4.2 Event Compression Strategy

`shouldMergeInsert` merges adjacent inserts only when all conditions hold:
- both events are `insert`;
- positions are contiguous: `prev.pos + prev.text.length === next.pos`;
- time gap <= `MERGE_WINDOW_MS` (`300`);
- input is not paste, not containing newline, and not selection replacement.

Merge behavior: append new text to previous `insert.text` and update previous timestamp to the new event time.

### 4.3 Undo Implementation

- Each input action pushes `createdCount` (1 or 2) into `actionSizes`.
- Undo pops one `removeCount` and truncates the tail of `events` by that amount.
- Then `WPRModel.replayEvents(events)` rebuilds editor text from empty state.

So undo is implemented via event-log rollback and replay, not browser-native undo stack, keeping session JSON replay-consistent.

### 4.4 Persistence, Import, and Export

- Autosave: writes to `localStorage["wpr:lastSession"]` after edits.
- Export: `JSON.stringify(..., null, 2)` + `Blob` + downloadable link click.
- Import: `FileReader.readAsText` -> `JSON.parse` -> `validateSession` -> `restoreSession`.
- New session: clears in-memory state and local cache (with confirmation prompt to reduce accidental loss).

## 5. Replay Pipeline

Key state in `replay.js`:
- `session` / `events`: current loaded session.
- `cursor`: number of already-applied events.
- `currentText`: currently rendered text.
- `isPlaying` / `timerId`: playback control state.
- `speed`: playback multiplier, default `5`.
- statistics DOM refs and thresholds for analytics (effective pause cap and likely-paste heuristics).

### 5.1 Playback Scheduling

Core function: `scheduleNext()`
1. If `cursor >= events.length`, stop and mark replay complete.
2. Compute `rawGapMs` from current event timestamp and previous event timestamp.
3. Map pause duration via `mapGapForReplay(rawGapMs)`:
   - `<= 10s`: keep original gap,
   - `10s ~ 10min`: map to `10s`,
   - `>= 10min`: map to `20s`.
4. Compute `delay = mappedGapMs / speed` and schedule with `setTimeout`.
5. On tick, apply event with `WPRModel.applyEvent`, update UI, and recursively schedule next event.

### 5.2 Pause, Speed, and Seek

- Pause: clears timer, keeps `cursor` and `currentText`.
- Speed change: if currently playing, resets timer and continues with new speed.
- Seek via progress bar: `seekToCursor(nextCursor, true)` reconstructs text with `replayEvents(events.slice(0, cursor))`.

### 5.3 Session Source Priority

1. On page load, try `localStorage["wpr:lastSession"]` first.
2. User can import JSON at any time to replace current session.
3. Imported session is saved back to local cache to keep Compose/Replay aligned.

### 5.4 Replay Statistics Panel

The replay page includes a bottom statistics panel derived from `events` only (no extra persisted fields):

- **Total duration**: timestamp of the last event (`events[events.length - 1].t`), or `0` for empty sessions.
- **Effective writing duration**: sum of per-gap `min(gap, 5min)` where `gap` is the interval between adjacent event timestamps (with `0 -> firstEvent.t` for the first gap).
- **Pause count (>5m)**: number of gaps strictly larger than 5 minutes.
- **Pause cursors**: interval markers like `11-12` (between event 11 and 12); first-gap pauses are marked `start-1`.
- **Deletion rate**: `totalDeletedChars / totalInsertedChars`; for zero inserted chars, displays `0%` to avoid division-by-zero.
- **Likely paste events** (heuristic): insert events with either
  - `text.length >= 20` and containing `\n` or `\t`, or
  - `text.length >= 80`.
- **Likely paste cursors**: 1-based cursor indices of matched insert events.

These metrics are recomputed whenever a session is loaded (from local storage or imported file).

## 6. Theme and Cross-Page State Transfer

Theme handling uses an early-apply and multi-channel sync strategy:
- Inline scripts in `index.html` and `replay.html` set `data-theme` before CSS loads.
- Navigation can carry `?theme=...`, then `theme.js` persists it.
- `window.name` is used for same-window cross-page theme handoff without requiring a persistent URL param.
- `storage` event keeps multiple tabs in sync.

## 7. Error Handling and Robustness

- **Model-level guards**: `applyEvent` and `validateSession` perform type and boundary checks.
- **Import safety**: any validation error aborts restore and surfaces an error message.
- **Storage tolerance**: `localStorage` access is wrapped in `try/catch` for restricted environments.
- **Replay failure handling**: playback stops immediately if event application fails.

## 8. Performance Characteristics and Complexity

- Recording path: per input, one diff pass (prefix/suffix scan), approximately O(n).
- Replay path: O(1) scheduler steps per event plus string slicing cost; overall roughly O(E * average text operation cost).
- Seek path: currently rebuilds from empty to target cursor, O(cursor).

For the current local research-tool scope, this implementation is simple and maintainable. For larger logs, replay can be optimized with checkpoints (cached snapshots every N events) to speed up seek.

## 9. Extension Opportunities (Based on Current Code)

- **Analytics**: add burst segmentation, rolling typing speed, and revision-density heatmaps over `events`.
- **Data versioning**: `version` is already present; migration functions can support historical JSON formats.
- **Replay enhancements**: sentence/paragraph jumps, key-event markers, and hotspot visualizations.
- **Performance improvements**: segmented snapshots and background precomputation for replay.

## 10. Key Takeaways

The core design approach is:
- represent text evolution with a minimal event model,
- ensure replayability/validity/recoverability via pure functions,
- rely on browser-native APIs for local persistence and file exchange,
- decouple recording and replay into two pages for clearer structure.

For maintainers, `js/model.js` is the consistency center, `js/compose.js` and `js/replay.js` are the two business pipelines, and `js/theme.js` provides cross-page UX consistency. The overall design is lightweight, has clear boundaries, and is suitable for iterative research-oriented feature growth.
