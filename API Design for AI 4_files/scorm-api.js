/**
 * SCORM 1.2 API wrapper.
 *
 * Discovers the LMS-injected window.API (or window.parent.API, etc.),
 * opens a session via LMSInitialize, and exposes a small typed surface
 * for getting/setting the cmi.* keys we use:
 *   cmi.core.lesson_status   — passed | completed | failed | incomplete
 *   cmi.core.score.raw       — 0..100 numeric score for the assessment(s)
 *   cmi.core.score.min/max   — 0 / 100
 *   cmi.suspend_data         — small JSON blob with current slide index + scores
 *   cmi.core.session_time    — how long this session lasted (HH:MM:SS)
 *
 * If no API is found (e.g., zip opened directly in a browser for testing),
 * the wrapper degrades to a no-op so the player still runs.
 */
(function () {
  'use strict';

  var MAX_PARENT_HOPS = 500;

  function findAPI(win) {
    var hops = 0;
    while (win && !win.API && win.parent && win.parent !== win && hops < MAX_PARENT_HOPS) {
      win = win.parent;
      hops += 1;
    }
    return win && win.API ? win.API : null;
  }

  function discoverAPI() {
    var api = findAPI(window);
    if (api) return api;
    if (window.opener && !window.opener.closed) {
      api = findAPI(window.opener);
      if (api) return api;
    }
    return null;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatSessionTime(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
  }

  var api = discoverAPI();
  var initialized = false;
  var sessionStart = Date.now();
  var noopWarned = false;
  var interactionCount = 0;

  function warnNoop() {
    if (!noopWarned) {
      console.warn('[SCORM] No LMS API found. Running in standalone mode; progress will not be persisted.');
      noopWarned = true;
    }
  }

  var ScormAPI = {
    initialize: function () {
      if (!api) { warnNoop(); return false; }
      var result = api.LMSInitialize('');
      initialized = result === 'true' || result === true;
      if (initialized) {
        // Default lesson_status to incomplete for fresh launches; existing
        // status is preserved across sessions automatically by the LMS.
        var current = api.LMSGetValue('cmi.core.lesson_status');
        if (current === 'not attempted' || current === '') {
          api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
          api.LMSCommit('');
        }
      }
      return initialized;
    },

    getValue: function (key) {
      if (!api || !initialized) { warnNoop(); return ''; }
      return api.LMSGetValue(key);
    },

    setValue: function (key, value) {
      if (!api || !initialized) { warnNoop(); return false; }
      var result = api.LMSSetValue(key, String(value));
      return result === 'true' || result === true;
    },

    commit: function () {
      if (!api || !initialized) { warnNoop(); return false; }
      var result = api.LMSCommit('');
      return result === 'true' || result === true;
    },

    setStatus: function (status) {
      // status: 'passed' | 'completed' | 'failed' | 'incomplete'
      return this.setValue('cmi.core.lesson_status', status) && this.commit();
    },

    setScore: function (raw, min, max) {
      if (!api || !initialized) { warnNoop(); return false; }
      api.LMSSetValue('cmi.core.score.raw', String(Math.round(raw)));
      api.LMSSetValue('cmi.core.score.min', String(min == null ? 0 : min));
      api.LMSSetValue('cmi.core.score.max', String(max == null ? 100 : max));
      return this.commit();
    },

    /**
     * Record a single per-question interaction so the LMS (Docebo) can
     * report on per-question performance. SCORM 1.2 cmi.interactions.* is
     * write-only; we use a session-local counter and append.
     *
     * props: {
     *   id:                 string,  // e.g., "mod1/slotA_v2"
     *   type:               string,  // 'choice' | 'fill-in' | 'numeric' | etc.
     *   student_response:   string,  // e.g., "a" or "a,c,d"
     *   correct_response:   string,  // same shape as student_response
     *   result:             'correct' | 'wrong' | 'neutral' | 'unanticipated',
     *   weighting?:         number,  // optional, defaults to 1
     *   latency_ms?:        number   // optional, milliseconds spent on question
     * }
     */
    recordInteraction: function (props) {
      if (!api || !initialized) { warnNoop(); return false; }
      var n = interactionCount++;
      var prefix = 'cmi.interactions.' + n + '.';
      try {
        if (props.id) api.LMSSetValue(prefix + 'id', String(props.id));
        if (props.type) api.LMSSetValue(prefix + 'type', String(props.type));
        if (props.student_response !== undefined && props.student_response !== null) {
          api.LMSSetValue(prefix + 'student_response', String(props.student_response));
        }
        if (props.correct_response !== undefined && props.correct_response !== null) {
          api.LMSSetValue(prefix + 'correct_responses.0.pattern', String(props.correct_response));
        }
        if (props.result) api.LMSSetValue(prefix + 'result', String(props.result));
        var w = props.weighting == null ? 1 : props.weighting;
        api.LMSSetValue(prefix + 'weighting', String(w));
        if (props.latency_ms != null) {
          // SCORM 1.2 latency format: HHHH:MM:SS.SS (max ~9999 hours)
          var totalSec = Math.max(0, props.latency_ms) / 1000;
          var h = Math.floor(totalSec / 3600);
          var m = Math.floor((totalSec % 3600) / 60);
          var s = (totalSec % 60).toFixed(2);
          api.LMSSetValue(prefix + 'latency',
            (h < 10 ? '000' + h : (h < 100 ? '00' + h : (h < 1000 ? '0' + h : '' + h))) +
            ':' + pad2(m) + ':' + (parseFloat(s) < 10 ? '0' + s : s));
        }
        // Wall-clock time of the interaction (HH:MM:SS, today's date)
        var now = new Date();
        api.LMSSetValue(prefix + 'time',
          pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()));
      } catch (e) {
        console.warn('[SCORM] recordInteraction failed for', props && props.id, e);
        return false;
      }
      return this.commit();
    },

    saveSuspendData: function (obj) {
      try {
        var json = JSON.stringify(obj);
        // SCORM 1.2 limits cmi.suspend_data to 4096 chars.
        if (json.length > 4000) {
          console.warn('[SCORM] suspend_data > 4000 chars, truncating');
          json = json.slice(0, 4000);
        }
        return this.setValue('cmi.suspend_data', json) && this.commit();
      } catch (e) {
        console.error('[SCORM] saveSuspendData failed', e);
        return false;
      }
    },

    loadSuspendData: function () {
      var raw = this.getValue('cmi.suspend_data');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.warn('[SCORM] suspend_data not valid JSON; ignoring');
        return null;
      }
    },

    getStudentName: function () {
      return this.getValue('cmi.core.student_name') || '';
    },

    finish: function () {
      if (!api || !initialized) { warnNoop(); return false; }
      var sessionMs = Date.now() - sessionStart;
      api.LMSSetValue('cmi.core.session_time', formatSessionTime(sessionMs));
      api.LMSCommit('');
      var result = api.LMSFinish('');
      initialized = false;
      return result === 'true' || result === true;
    },

    isAvailable: function () {
      return !!api;
    }
  };

  // Auto-finish on unload so the LMS sees a clean session close.
  window.addEventListener('beforeunload', function () {
    if (initialized) {
      try { ScormAPI.finish(); } catch (e) { /* swallow */ }
    }
  });

  window.ScormAPI = ScormAPI;
})();
