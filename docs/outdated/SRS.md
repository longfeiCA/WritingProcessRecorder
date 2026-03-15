# Writing Process Recorder

**Software Requirements Specification (SRS)**

Version: 1.1  
Date: 2026-03-15

---

# 1. Project Overview

## 1.1 Project Name

Writing Process Recorder  

---

## 1.2 Project Objective

The Writing Process Recorder is a browser-based application designed to record and replay the writing process of a user.

The software records all text editing operations performed during writing and allows the entire writing process to be replayed later.

This tool is intended for:

- writing research
- writing behavior analysis
- educational studies

The application focuses on accurately capturing how a text evolves from an empty document to the final version.

---

# 2. Core System Principles

The system follows several important design principles.

## 2.1 Fully Local Operation

The application runs entirely in the browser.

It can be:

- opened directly as a local HTML file
- or loaded from a web server

However, **no user data is ever stored on a server**.

All data processing and storage occur locally on the user's device.

---

## 2.2 No User Account System

The system does not include:

- user registration
- login system
- authentication
- user database

Users simply open the application and begin writing.

---

## 2.3 No Assignment or Task Management

The system does not provide:

- writing tasks
- assignment management
- course management
- teacher interfaces

Users freely start writing within the editor.

---

## 2.4 User-Controlled Data

All recorded writing data is stored locally.

Users can:

- export their writing records as files
- store them locally
- share them manually if required

The system itself never transmits user data.

---

# 3. User Roles

The system has only one direct user type.

## Writer

The writer is typically:

- a student
- a participant in a writing study

Researchers interact with the system only indirectly by collecting exported files.

Researchers do not require accounts within the system.

---

# 4. System Environment

## 4.1 Platform

The system must run in modern web browsers:

- Google Chrome
- Microsoft Edge
- Mozilla Firefox
- Safari

---

## 4.2 Technical Architecture

The application is implemented as a pure frontend web application.

Technology stack:

- HTML
- CSS
- JavaScript

The system does not depend on:

- server APIs
- backend services
- cloud storage
- databases

---

# 5. Functional Requirements

## 5.1 Writing Editor

The application provides a text editing interface for writing.

### Editor Characteristics

The editor is a **plain text editor**.

It does not support:

- rich text formatting
- bold or italic
- headings
- styled text

Using plain text simplifies the logging process and improves accuracy in recording writing behavior.

---

# 5.2 Writing Behavior Recording

The system must record all text editing operations.

The purpose of recording is to allow the entire writing process to be reconstructed later.

---

## 5.2.1 Recorded Operations

The system records the following types of editing actions.

### Text Insertion

Examples include:

- typing characters
- inserting spaces
- inserting punctuation
- pasting text

Operation type:

```
insert
```

---

### Text Deletion

Examples include:

- Backspace
- Delete key
- deleting selected text

Operation type:

```
delete
```

---

### Line Breaks

Line breaks are recorded as text insertion.

Example:

```
insert "\n"
```

---

## 5.2.2 Non-Recorded Behavior

The following actions are **not recorded**:

- mouse movement
- cursor movement steps
- arrow key navigation
- mouse clicks

These actions are not necessary for reconstructing the document.

The system records **where editing occurs**, not how the cursor moves.

---

## 5.2.3 Edit Position

Each editing event must record:

```
pos
```

This represents the position in the document where the edit occurs.

This information allows the system to reconstruct edits accurately.

---

## 5.2.4 Time Recording

Every event includes a timestamp.

Time precision:

**milliseconds**

Example:

```
12.345 seconds
```

This allows analysis of writing pauses and writing speed.

---

# 5.3 Continuous Input Compression

To reduce log size, consecutive typing operations may be merged.

Example:

User types:

```
hello
```

Instead of recording five events, the system may record:

```
insert "hello"
```

---

## 5.3.1 Conditions for Merging Events

Events may be merged if:

- they are the same input type
- positions are continuous
- time interval between inputs is short

---

## 5.3.2 Situations That Must Break Compression

A new event must be created when any of the following occur:

- deletion operations
- paste operations
- line breaks
- cursor position changes
- text replacement of a selection

---

# 5.4 Undo Functionality

The system supports undo operations.

Undo removes the most recent editing operation.

---

## 5.4.1 Undo Logging Rule

When an operation is undone:

the corresponding event must be removed from the log.

Example:

```
events.pop()
```

Undo operations themselves are **not recorded**.

Therefore the event log will not contain:

```
undo
redo
```

---

## 5.4.2 Undo Range

Undo should support **unlimited steps**.

As long as events exist in the log, they may be undone.

---

# 5.5 Saving Writing Records

Users can export their writing session.

The exported file contains:

- the full event log
- the final text

File format:

```
JSON
```

The file is saved to the user's local file system.

---

# 5.6 Importing Writing Records

Users can load a previously saved JSON file.

When a file is imported the system must:

- restore the document text
- restore the event log

After loading the document the user may continue writing.

New events are appended to the existing event list.

---

# 5.7 Writing Replay

The system provides the ability to replay the writing process.

Replay shows how the text evolved from an empty document to the final version.

---

## 5.7.1 Replay Process

Replay begins with an empty document.

```
text = ""
```

Events are then applied sequentially.

```
for event in events:
    apply(event)
```

Each operation updates the displayed text.

---

## 5.7.2 Replay Controls

The replay interface should include:

- Play
- Pause

Recommended additional controls:

- speed adjustment

Example speeds:

```
1x
2x
5x
10x
20x
50x
```

Default speed is 5x.

Replay timing policy:

- if event gap `<= 10s`, use original gap
- if event gap `> 10s` and `< 10min`, use `10s`
- if event gap `>= 10min`, use `20s`

Final replay delay is `mappedGap / speed`.

---

# 6. Data Storage Format

All writing data is stored in JSON format.

---

# 6.1 File Structure

Example file:

```json
{
  "version": 1,
  "startTime": 0,
  "finalText": "Hello world",
  "events": [
    {"t":0.2,"type":"insert","pos":0,"text":"H"},
    {"t":0.4,"type":"insert","pos":1,"text":"e"},
    {"t":0.6,"type":"insert","pos":2,"text":"l"},
    {"t":0.8,"type":"insert","pos":3,"text":"l"},
    {"t":1.0,"type":"insert","pos":4,"text":"o"},
    {"t":2.0,"type":"delete","pos":4,"length":1},
    {"t":2.3,"type":"insert","pos":4,"text":"o"},
    {"t":3.0,"type":"insert","pos":5,"text":" world"}
  ]
}
```

---

# 6.2 Field Definitions

|Field|Description|
|---|---|
|version|File format version|
|startTime|Writing start time|
|finalText|Final document text|
|events|List of editing events|

---

# 6.3 Event Structure

Each event contains the following fields.

|Field|Description|
|---|---|
|t|timestamp|
|type|operation type|
|pos|position in text|

---

### Insert Event

Example:

```
{
 "t":12.4,
 "type":"insert",
 "pos":54,
 "text":"hello"
}
```

---

### Delete Event

Example:

```
{
 "t":15.2,
 "type":"delete",
 "pos":10,
 "length":3
}
```

---

# 7. Replay Algorithm

Replay reconstructs the document by applying events sequentially.

Initial state:

```
text = ""
```

For each event:

```
for event in events:
    apply(event)
```

---

### Insert Operation

```
text =
text[0:pos] + insertedText + text[pos:]
```

---

### Delete Operation

```
text =
text[0:pos] + text[pos + length:]
```

---

# 8. Performance Requirements

The system should support logs containing tens of thousands of editing events.

Typical file size:

```
100 KB – 2 MB
```

Replay should remain smooth in modern browsers.

---

# 9. Data Security

The system follows a **zero server storage policy**.

All user data:

- remains on the user's device
- is never transmitted automatically
- must be manually exported if sharing is required

---

# 10. User Interface Requirements

## Writing Interface

The main writing interface includes:

- text editor
- save button
- import button

---

## Replay Interface

The replay interface includes:

- play button
- pause button
- replay speed control
- text display area

---

# 11. Future Extensions

Possible future features include:

- pause analysis
- writing speed statistics
- deletion rate analysis
- revision pattern analysis

These features are outside the scope of the current version.

---

# 12. Non-Functional Requirements

## Portability

The application must support offline usage.

---

## Simple Deployment

The application should be usable by simply opening an HTML file in a browser.

---

## Long-Term Data Readability

JSON files must remain readable in future versions of the software.

---

# 13. Summary

The Writing Process Recorder is a lightweight browser application designed to record and replay writing processes.

Core capabilities include:

- recording writing behavior
- exporting writing logs
- importing writing sessions
- replaying the full writing process

The system prioritizes:

- simplicity
- privacy
- local data control
- accurate reconstruction of writing activity. 
