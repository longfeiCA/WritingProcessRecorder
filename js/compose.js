(function initCompose(global) {
  "use strict";

  var STORAGE_KEY = "wpr:lastSession";
  var MERGE_WINDOW_MS = 300;

  var editor = document.getElementById("editor");
  var undoBtn = document.getElementById("undoBtn");
  var saveBtn = document.getElementById("saveBtn");
  var importFile = document.getElementById("importFile");
  var toReplayBtn = document.getElementById("toReplayBtn");
  var statusEl = document.getElementById("status");
  var metricsEl = document.getElementById("metrics");

  var events = [];
  var actionSizes = [];
  var prevText = "";
  var sessionStartTime = Date.now();

  var pendingInputMeta = {
    inputType: "",
    selectionStart: 0,
    selectionEnd: 0
  };

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function updateMetrics() {
    metricsEl.textContent = "Events: " + events.length;
  }

  function nowElapsedMs() {
    return Date.now() - sessionStartTime;
  }

  function commonPrefixLength(a, b) {
    var len = Math.min(a.length, b.length);
    var i = 0;
    while (i < len && a.charCodeAt(i) === b.charCodeAt(i)) {
      i += 1;
    }
    return i;
  }

  function commonSuffixLength(a, b, maxLen) {
    var i = 0;
    while (
      i < maxLen &&
      a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)
    ) {
      i += 1;
    }
    return i;
  }

  function shouldMergeInsert(prevEvent, nextEvent, meta) {
    if (!prevEvent || prevEvent.type !== "insert" || nextEvent.type !== "insert") {
      return false;
    }
    if (meta.isPaste || meta.hasNewline || meta.isReplacement) {
      return false;
    }
    var expectedPos = prevEvent.pos + prevEvent.text.length;
    if (expectedPos !== nextEvent.pos) {
      return false;
    }
    if (nextEvent.t - prevEvent.t > MERGE_WINDOW_MS) {
      return false;
    }
    return true;
  }

  function pushEvent(event, mergeMeta) {
    var prevEvent = events.length > 0 ? events[events.length - 1] : null;

    if (event.type === "insert" && shouldMergeInsert(prevEvent, event, mergeMeta)) {
      prevEvent.text += event.text;
      prevEvent.t = event.t;
      return false;
    }

    events.push(event);
    return true;
  }

  function makeSession() {
    return global.WPRModel.buildSession({
      startTime: sessionStartTime,
      finalText: editor.value,
      events: events
    });
  }

  function persistToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(makeSession()));
    } catch (err) {
      setStatus("Could not store session in localStorage: " + err.message, true);
    }
  }

  function restoreSession(session, sourceLabel) {
    var validation = global.WPRModel.validateSession(session);
    if (!validation.ok) {
      throw new Error(validation.errors.join("; "));
    }

    events = session.events.map(function mapEvent(event) {
      return JSON.parse(JSON.stringify(event));
    });
    actionSizes = events.map(function mapAction() {
      return 1;
    });

    editor.value = session.finalText;
    prevText = session.finalText;

    var lastT = events.length > 0 ? events[events.length - 1].t : 0;
    sessionStartTime = Date.now() - lastT;

    updateMetrics();
    setStatus("Loaded session from " + sourceLabel + ".", false);
  }

  function handleInput() {
    var nextText = editor.value;
    if (nextText === prevText) {
      return;
    }

    var prefix = commonPrefixLength(prevText, nextText);
    var oldRemaining = prevText.length - prefix;
    var newRemaining = nextText.length - prefix;
    var suffix = commonSuffixLength(
      prevText.slice(prefix),
      nextText.slice(prefix),
      Math.min(oldRemaining, newRemaining)
    );

    var oldMidEnd = prevText.length - suffix;
    var newMidEnd = nextText.length - suffix;
    var deletedText = prevText.slice(prefix, oldMidEnd);
    var insertedText = nextText.slice(prefix, newMidEnd);

    var t = nowElapsedMs();
    var inputType = pendingInputMeta.inputType || "";
    var isPaste = inputType === "insertFromPaste";
    var hasNewline = insertedText.indexOf("\n") !== -1;
    var selectedBefore = pendingInputMeta.selectionEnd > pendingInputMeta.selectionStart;
    var isReplacement = selectedBefore && deletedText.length > 0 && insertedText.length > 0;

    var createdCount = 0;

    if (deletedText.length > 0) {
      if (pushEvent(
        {
          t: t,
          type: "delete",
          pos: prefix,
          length: deletedText.length
        },
        { isPaste: false, hasNewline: false, isReplacement: false }
      )) {
        createdCount += 1;
      }
    }

    if (insertedText.length > 0) {
      if (pushEvent(
        {
          t: t,
          type: "insert",
          pos: prefix,
          text: insertedText
        },
        {
          isPaste: isPaste,
          hasNewline: hasNewline,
          isReplacement: isReplacement
        }
      )) {
        createdCount += 1;
      }
    }

    if (createdCount > 0) {
      actionSizes.push(createdCount);
    }

    prevText = nextText;
    updateMetrics();
    setStatus("Recording edits.", false);
    persistToLocalStorage();
  }

  function handleUndo() {
    if (events.length === 0 || actionSizes.length === 0) {
      setStatus("Nothing to undo.", false);
      return;
    }

    var removeCount = actionSizes.pop();
    events.splice(events.length - removeCount, removeCount);

    try {
      var rebuilt = global.WPRModel.replayEvents(events);
      editor.value = rebuilt;
      prevText = rebuilt;
      persistToLocalStorage();
      updateMetrics();
      setStatus("Last operation undone.", false);
    } catch (err) {
      setStatus("Undo failed: " + err.message, true);
    }
  }

  function handleSave() {
    try {
      var session = makeSession();
      var json = JSON.stringify(session, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var href = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = href;
      a.download = "writing-session-" + Date.now() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setStatus("Session exported to JSON.", false);
      persistToLocalStorage();
    } catch (err) {
      setStatus("Export failed: " + err.message, true);
    }
  }

  function handleImportChange() {
    var file = importFile.files && importFile.files[0];
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function onLoad() {
      try {
        var session = JSON.parse(String(reader.result));
        restoreSession(session, "file");
        persistToLocalStorage();
      } catch (err) {
        setStatus("Import failed: " + err.message, true);
      } finally {
        importFile.value = "";
      }
    };

    reader.onerror = function onError() {
      setStatus("Import failed: unable to read file.", true);
      importFile.value = "";
    };

    reader.readAsText(file);
  }

  function goToReplay() {
    persistToLocalStorage();
    location.href = "replay.html";
  }

  function loadFromLocalStorageIfAny() {
    var raw = "";
    try {
      raw = localStorage.getItem(STORAGE_KEY) || "";
      if (!raw) {
        return;
      }
      var parsed = JSON.parse(raw);
      restoreSession(parsed, "local storage");
    } catch (err) {
      setStatus("Could not restore local session: " + err.message, true);
    }
  }

  function setup() {
    toReplayBtn.classList.add("primary");

    editor.addEventListener("beforeinput", function onBeforeInput(event) {
      pendingInputMeta.inputType = event.inputType || "";
      pendingInputMeta.selectionStart = editor.selectionStart;
      pendingInputMeta.selectionEnd = editor.selectionEnd;
    });

    editor.addEventListener("input", handleInput);
    undoBtn.addEventListener("click", handleUndo);
    saveBtn.addEventListener("click", handleSave);
    importFile.addEventListener("change", handleImportChange);
    toReplayBtn.addEventListener("click", goToReplay);

    prevText = editor.value;
    updateMetrics();
    loadFromLocalStorageIfAny();
  }

  setup();
})(window);
