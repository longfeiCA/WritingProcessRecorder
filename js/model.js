(function initModel(global) {
  "use strict";

  function cloneEvent(event) {
    return JSON.parse(JSON.stringify(event));
  }

  function applyEvent(text, event) {
    if (!event || typeof event !== "object") {
      throw new Error("Invalid event object");
    }

    if (event.type === "insert") {
      if (typeof event.pos !== "number" || typeof event.text !== "string") {
        throw new Error("Invalid insert event fields");
      }
      if (event.pos < 0 || event.pos > text.length) {
        throw new Error("Insert position out of range");
      }
      return text.slice(0, event.pos) + event.text + text.slice(event.pos);
    }

    if (event.type === "delete") {
      if (typeof event.pos !== "number" || typeof event.length !== "number") {
        throw new Error("Invalid delete event fields");
      }
      if (event.pos < 0 || event.length < 0 || event.pos + event.length > text.length) {
        throw new Error("Delete range out of range");
      }
      return text.slice(0, event.pos) + text.slice(event.pos + event.length);
    }

    throw new Error("Unknown event type");
  }

  function replayEvents(events) {
    var text = "";
    for (var i = 0; i < events.length; i += 1) {
      text = applyEvent(text, events[i]);
    }
    return text;
  }

  function validateEvent(event) {
    if (!event || typeof event !== "object") {
      return "Event must be an object";
    }
    if (typeof event.t !== "number" || !Number.isFinite(event.t) || event.t < 0) {
      return "Event.t must be a non-negative number";
    }
    if (event.type !== "insert" && event.type !== "delete") {
      return "Event.type must be insert or delete";
    }
    if (typeof event.pos !== "number" || !Number.isInteger(event.pos) || event.pos < 0) {
      return "Event.pos must be a non-negative integer";
    }

    if (event.type === "insert") {
      if (typeof event.text !== "string") {
        return "Insert event.text must be a string";
      }
    } else {
      if (typeof event.length !== "number" || !Number.isInteger(event.length) || event.length < 0) {
        return "Delete event.length must be a non-negative integer";
      }
    }
    return "";
  }

  function validateSession(session) {
    var errors = [];

    if (!session || typeof session !== "object") {
      return { ok: false, errors: ["Session must be a JSON object"] };
    }

    if (typeof session.version !== "number") {
      errors.push("version must be a number");
    }
    if (typeof session.startTime !== "number" || !Number.isFinite(session.startTime)) {
      errors.push("startTime must be a finite number");
    }
    if (typeof session.finalText !== "string") {
      errors.push("finalText must be a string");
    }
    if (!Array.isArray(session.events)) {
      errors.push("events must be an array");
      return { ok: errors.length === 0, errors: errors };
    }

    for (var i = 0; i < session.events.length; i += 1) {
      var issue = validateEvent(session.events[i]);
      if (issue) {
        errors.push("events[" + i + "]: " + issue);
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors: errors };
    }

    try {
      var reconstructed = replayEvents(session.events);
      if (reconstructed !== session.finalText) {
        errors.push("finalText does not match replayed events");
      }
    } catch (err) {
      errors.push("events cannot be replayed: " + err.message);
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function buildSession(params) {
    return {
      version: 1,
      startTime: params.startTime,
      finalText: params.finalText,
      events: params.events.map(cloneEvent)
    };
  }

  global.WPRModel = {
    applyEvent: applyEvent,
    replayEvents: replayEvents,
    validateSession: validateSession,
    buildSession: buildSession
  };
})(window);
