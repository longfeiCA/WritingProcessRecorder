(function initReplay(global) {
  "use strict";

  var STORAGE_KEY = "wpr:lastSession";

  var replayText = document.getElementById("replayText");
  var playBtn = document.getElementById("playBtn");
  var pauseBtn = document.getElementById("pauseBtn");
  var speedSelect = document.getElementById("speedSelect");
  var replayImportFile = document.getElementById("replayImportFile");
  var backBtn = document.getElementById("backBtn");
  var progressBar = document.getElementById("progressBar");
  var progressText = document.getElementById("progressText");
  var statusEl = document.getElementById("status");
  var metricsEl = document.getElementById("metrics");

  var session = null;
  var events = [];

  var speed = 1;
  var timerId = null;
  var isPlaying = false;
  var cursor = 0;
  var currentText = "";

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function updateMetrics() {
    var percent = events.length === 0 ? 0 : Math.round((cursor / events.length) * 100);
    metricsEl.textContent = "Events: " + events.length + " | Cursor: " + cursor + " | " + percent + "%";
  }

  function updateProgressUI() {
    var max = events.length;
    progressBar.max = String(max);
    progressBar.value = String(Math.min(cursor, max));
    progressBar.disabled = max === 0;

    var percent = max === 0 ? 0 : Math.round((cursor / max) * 100);
    progressText.textContent = percent + "%";
  }

  function renderText() {
    replayText.textContent = currentText;
    updateMetrics();
    updateProgressUI();
  }

  function clearPlaybackTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function resetPlaybackState() {
    clearPlaybackTimer();
    isPlaying = false;
    cursor = 0;
    currentText = "";
    renderText();
  }

  function scheduleNext() {
    if (!isPlaying) {
      return;
    }

    if (cursor >= events.length) {
      isPlaying = false;
      setStatus("Replay finished.", false);
      return;
    }

    var prevT = cursor === 0 ? 0 : events[cursor - 1].t;
    var delay = Math.max(0, (events[cursor].t - prevT) / speed);

    timerId = setTimeout(function onTick() {
      try {
        currentText = global.WPRModel.applyEvent(currentText, events[cursor]);
        cursor += 1;
        renderText();
        scheduleNext();
      } catch (err) {
        isPlaying = false;
        setStatus("Replay failed: " + err.message, true);
      }
    }, delay);
  }

  function play() {
    if (!session) {
      setStatus("No session loaded. Import a JSON file first.", true);
      return;
    }

    if (cursor >= events.length) {
      resetPlaybackState();
    }

    if (isPlaying) {
      return;
    }

    isPlaying = true;
    setStatus("Replay playing.", false);
    scheduleNext();
  }

  function pause() {
    if (!isPlaying) {
      return;
    }
    isPlaying = false;
    clearPlaybackTimer();
    setStatus("Replay paused.", false);
  }

  function seekToCursor(nextCursor, keepPlaying) {
    var clampedCursor = Math.max(0, Math.min(nextCursor, events.length));
    var wasPlaying = isPlaying;

    clearPlaybackTimer();
    isPlaying = false;
    cursor = clampedCursor;

    try {
      currentText = global.WPRModel.replayEvents(events.slice(0, cursor));
      renderText();
    } catch (err) {
      setStatus("Seek failed: " + err.message, true);
      return;
    }

    if (keepPlaying && wasPlaying) {
      isPlaying = true;
      scheduleNext();
    }
  }

  function applyLoadedSession(nextSession, sourceLabel) {
    var validation = global.WPRModel.validateSession(nextSession);
    if (!validation.ok) {
      throw new Error(validation.errors.join("; "));
    }

    session = {
      version: nextSession.version,
      startTime: nextSession.startTime,
      finalText: nextSession.finalText,
      events: nextSession.events.map(function copy(event) {
        return JSON.parse(JSON.stringify(event));
      })
    };
    events = session.events;

    resetPlaybackState();
    setStatus("Session loaded from " + sourceLabel + ".", false);
  }

  function loadFromLocalStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setStatus("No session in local storage. Import JSON to replay.", false);
        return;
      }
      applyLoadedSession(JSON.parse(raw), "local storage");
    } catch (err) {
      setStatus("Could not load local session: " + err.message, true);
    }
  }

  function onReplayImportChange() {
    var file = replayImportFile.files && replayImportFile.files[0];
    if (!file) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function onLoad() {
      try {
        var parsed = JSON.parse(String(reader.result));
        applyLoadedSession(parsed, "file");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch (err) {
        setStatus("Import failed: " + err.message, true);
      } finally {
        replayImportFile.value = "";
      }
    };
    reader.onerror = function onError() {
      setStatus("Import failed: unable to read file.", true);
      replayImportFile.value = "";
    };

    reader.readAsText(file);
  }

  function onSpeedChange() {
    var nextSpeed = Number(speedSelect.value);
    if (!Number.isFinite(nextSpeed) || nextSpeed <= 0) {
      return;
    }
    speed = nextSpeed;
    if (isPlaying) {
      clearPlaybackTimer();
      scheduleNext();
    }
  }

  function onProgressInput() {
    var nextCursor = Number(progressBar.value);
    if (!Number.isFinite(nextCursor)) {
      return;
    }
    seekToCursor(nextCursor, true);
  }

  function onProgressChange() {
    var max = events.length;
    if (max === 0) {
      return;
    }
    var percent = Math.round((cursor / max) * 100);
    setStatus("Jumped to " + percent + "%.", false);
  }

  function backToCompose() {
    location.href = "index.html";
  }

  function setup() {
    playBtn.classList.add("primary");

    playBtn.addEventListener("click", play);
    pauseBtn.addEventListener("click", pause);
    speedSelect.addEventListener("change", onSpeedChange);
    replayImportFile.addEventListener("change", onReplayImportChange);
    backBtn.addEventListener("click", backToCompose);
    progressBar.addEventListener("input", onProgressInput);
    progressBar.addEventListener("change", onProgressChange);

    renderText();
    loadFromLocalStorage();
  }

  setup();
})(window);
