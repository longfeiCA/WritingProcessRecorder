# Writing Process Recorder

A fully local, browser-based application designed to record and replay the writing process. The software captures all text editing operations performed during writing and allows the entire document evolution to be replayed later. It is ideal for writing research, behavior analysis, and educational studies.

## Features

- **Compose Interface**: A plain text editor that silently records all text editing operations (insertions and deletions) with millisecond precision.
- **Replay Interface**: Watch the document evolve from an empty state to the final text, step-by-step. Features play, pause, scrubbing, and playback speed controls (0.5x to 20x).
- **Local Data Control**: Save the writing session locally as a JSON file, and import it back anytime.
- **Event Compression**: Optimizes session logs by smartly merging continuous typing operations while preserving exact editing behavior.
- **Fully Local & Private**: Runs entirely in the browser using standard web APIs. No backend, no databases, no user accounts, and zero server storage.

## Usage

Since it is a pure frontend application, no build tools or servers are required. Simply open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Apple Safari).

1. **Write**: Open `index.html` and start typing. Your edits are automatically recorded.
2. **Export/Import**: Click "Save JSON" to export the session to your device. You can import previously saved sessions to continue writing or replay them.
3. **Replay**: Click "Go to Replay" to switch to the replay interface (`replay.html`). Click "Play" to watch the writing process unfold at your desired speed.

## Project Structure

- `index.html` - The Compose page where writing and recording happens.
- `replay.html` - The Replay page where recorded sessions are played back.
- `styles/base.css` - Shared styling, layout, and responsive behavior.
- `js/model.js` - Core data model, event application logic, and JSON schema validation.
- `js/compose.js` - Event capture, compression logic, undo behavior, and import/export functionality.
- `js/replay.js` - Playback scheduler, timeline scrubbing, and UI control wiring.
- `js/theme.js` - Handles switching between light and dark themes.

## Data Format

Writing sessions are stored as a JSON object containing the document's final state and an array of sequential edit events (`insert` or `delete`) with precise timestamps and text positions. This ensures the editing process can be accurately reconstructed without storing extraneous data like mouse movements.
