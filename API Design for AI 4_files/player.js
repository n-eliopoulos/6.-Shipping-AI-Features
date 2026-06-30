/**
 * FINRA SCORM Player Runtime.
 *
 * Loads course.json, builds a flat sequence of "screens" (slides + assessments),
 * renders one at a time, persists progress via SCORM 1.2, and reports
 * completion + score on the final screen.
 */
(function () {
  'use strict';

  // ---------- State ----------

  /** @type {object} */ let course = null;
  /** @type {Array<object>} */ let screens = [];
  /** @type {number} */ let currentIndex = 0;
  /** @type {Record<string, number>} */ let moduleScores = {}; // moduleId -> percent
  /** @type {Record<string, boolean>} */ let modulePassed = {};
  /** @type {Record<string, Array<string>>} */ let assessmentSelections = {}; // questionId -> selected ids
  /** @type {Record<string, boolean>} */ let assessmentSubmitted = {}; // moduleId -> submitted
  /** @type {Record<string, number>} */ let assessmentAttempts = {}; // moduleId -> count of submits
  /** @type {Record<string, number>} */ let questionStartTimes = {}; // questionId -> ms timestamp

  // ---------- Init ----------

  document.addEventListener('DOMContentLoaded', async function () {
    try {
      window.ScormAPI.initialize();
      await loadCourse();
      buildScreenSequence();
      restoreProgress();
      render();
    } catch (err) {
      showError(err);
    }
  });

  async function loadCourse() {
    const res = await fetch('content/course.json');
    if (!res.ok) throw new Error('Could not load course.json');
    course = await res.json();
  }

  function buildScreenSequence() {
    screens = [];
    course.modules.forEach(function (mod, modIdx) {
      mod.slides.forEach(function (slide) {
        screens.push({ kind: 'slide', module: mod, moduleIndex: modIdx, slide: slide });
      });
      if (mod.assessment) {
        screens.push({ kind: 'assessment', module: mod, moduleIndex: modIdx });
      }
    });
    screens.push({ kind: 'completion' });
  }

  function restoreProgress() {
    const saved = window.ScormAPI.loadSuspendData();
    if (saved && typeof saved === 'object') {
      if (typeof saved.currentIndex === 'number' && saved.currentIndex < screens.length) {
        currentIndex = saved.currentIndex;
      }
      if (saved.moduleScores) moduleScores = saved.moduleScores;
      if (saved.modulePassed) modulePassed = saved.modulePassed;
      if (saved.assessmentAttempts) assessmentAttempts = saved.assessmentAttempts;
    }
  }

  function persistProgress() {
    window.ScormAPI.saveSuspendData({
      currentIndex: currentIndex,
      moduleScores: moduleScores,
      modulePassed: modulePassed,
      assessmentAttempts: assessmentAttempts
    });
  }

  // ---------- Render ----------

  function render() {
    const screen = screens[currentIndex];
    const root = document.getElementById('app');
    root.removeAttribute('aria-busy');
    root.innerHTML = '';
    root.appendChild(renderHeader(screen));
    const main = document.createElement('main');
    main.className = 'player-content';
    main.setAttribute('aria-live', 'polite');
    if (screen.kind === 'slide') {
      main.appendChild(renderSlide(screen));
    } else if (screen.kind === 'assessment') {
      main.appendChild(renderAssessment(screen));
    } else {
      main.appendChild(renderCompletion());
    }
    root.appendChild(main);
    root.appendChild(renderFooter(screen));
    wireInteractiveChecks(root);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /**
   * Wire up the interactive in-slide checks: predict-numeric, cloze-check,
   * sequence-check. Called once per render. Idempotent — safe to call again
   * if the same elements are re-rendered.
   */
  function wireInteractiveChecks(root) {
    // Predict-numeric: <div class="predict-numeric" data-expected="..." data-tolerance="0.05">
    //   inner: <input type="number">, <button class="check-btn">, <div class="check-feedback">,
    //          optional <details class="quick-check-answer">
    root.querySelectorAll('.predict-numeric').forEach(function (el) {
      if (el.__wired) return; el.__wired = true;
      var btn = el.querySelector('.check-btn');
      var input = el.querySelector('input[type="number"]');
      var feedback = el.querySelector('.check-feedback');
      if (!btn || !input || !feedback) return;
      var expected = parseFloat(el.getAttribute('data-expected'));
      var tolerance = parseFloat(el.getAttribute('data-tolerance') || '0.01');
      btn.addEventListener('click', function () {
        var v = parseFloat(input.value);
        if (isNaN(v)) {
          feedback.className = 'check-feedback wrong';
          feedback.textContent = 'Enter a number first.';
          return;
        }
        var diff = Math.abs(v - expected);
        var ok = diff <= Math.max(tolerance * Math.abs(expected), 1e-6);
        feedback.className = 'check-feedback ' + (ok ? 'correct' : 'wrong');
        if (ok) {
          feedback.textContent = '✓ Within tolerance.';
        } else {
          var pct = Math.abs(expected) > 0 ? (diff / Math.abs(expected) * 100).toFixed(1) : '∞';
          feedback.textContent = '✗ Off by ' + pct + '%. Try again or reveal the answer below.';
        }
      });
    });

    // Cloze-check: inputs each carry data-answer (use | to separate alternatives)
    root.querySelectorAll('.cloze-check').forEach(function (el) {
      if (el.__wired) return; el.__wired = true;
      var btn = el.querySelector('.check-btn');
      var inputs = el.querySelectorAll('input[data-answer]');
      var feedback = el.querySelector('.check-feedback');
      if (!btn || inputs.length === 0) return;
      btn.addEventListener('click', function () {
        var correctCount = 0;
        inputs.forEach(function (input) {
          var raw = (input.getAttribute('data-answer') || '').toLowerCase().trim();
          var got = (input.value || '').toLowerCase().trim();
          var alternatives = raw.indexOf('|') >= 0
            ? raw.split('|').map(function (s) { return s.trim(); })
            : [raw];
          var ok = alternatives.indexOf(got) >= 0;
          input.classList.remove('correct', 'wrong');
          input.classList.add(ok ? 'correct' : 'wrong');
          if (ok) correctCount++;
        });
        if (feedback) {
          feedback.className = 'check-feedback ' + (correctCount === inputs.length ? 'correct' : 'wrong');
          feedback.textContent = correctCount === inputs.length
            ? '✓ All correct.'
            : '✗ ' + correctCount + ' / ' + inputs.length + ' correct. Adjust the wrong ones (in red).';
        }
      });
    });

    // Sequence-check: each <li> has data-correct-position and an <input type="number">
    root.querySelectorAll('.sequence-check').forEach(function (el) {
      if (el.__wired) return; el.__wired = true;
      var btn = el.querySelector('.check-btn');
      var items = el.querySelectorAll('li[data-correct-position]');
      var feedback = el.querySelector('.check-feedback');
      if (!btn || items.length === 0) return;
      btn.addEventListener('click', function () {
        var correctCount = 0;
        items.forEach(function (li) {
          var input = li.querySelector('input[type="number"]');
          var expected = parseInt(li.getAttribute('data-correct-position'), 10);
          var got = parseInt(input && input.value, 10);
          var ok = !isNaN(got) && got === expected;
          li.classList.remove('correct', 'wrong');
          li.classList.add(ok ? 'correct' : 'wrong');
          if (ok) correctCount++;
        });
        if (feedback) {
          feedback.className = 'check-feedback ' + (correctCount === items.length ? 'correct' : 'wrong');
          feedback.textContent = correctCount === items.length
            ? '✓ All in correct order.'
            : '✗ ' + correctCount + ' / ' + items.length + ' positions correct.';
        }
      });
    });
  }

  function renderHeader(screen) {
    const hdr = document.createElement('header');
    hdr.className = 'player-header';
    const title = document.createElement('h1');
    title.textContent = course.title;
    hdr.appendChild(title);
    const label = document.createElement('span');
    label.className = 'module-label';
    if (screen.kind === 'slide' || screen.kind === 'assessment') {
      label.textContent = 'Module ' + (screen.moduleIndex + 1) + ': ' + screen.module.title;
    } else {
      label.textContent = 'Course Complete';
    }
    hdr.appendChild(label);
    const progress = document.createElement('div');
    progress.className = 'player-progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    const pct = Math.round(((currentIndex + 1) / screens.length) * 100);
    progress.setAttribute('aria-valuenow', String(pct));
    const fill = document.createElement('div');
    fill.className = 'player-progress-fill';
    fill.style.width = pct + '%';
    progress.appendChild(fill);
    hdr.appendChild(progress);
    return hdr;
  }

  function renderSlide(screen) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<p class="loading">Loading slide…</p>';
    fetch('content/' + screen.slide.file)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        wrapper.innerHTML = html;
        // If this slide had a sandbox in source, append a read-only display
        // using the inlined Python source from course.json.
        if (screen.slide.sandboxCode) {
          appendSandboxDisplay(wrapper, screen.slide, screen.slide.sandboxCode);
        }
        // Apply syntax highlighting to any <code class="language-*"> blocks
        // (sandbox displays, code samples in slide bodies). Prism is loaded
        // in manual mode, so we trigger highlight per-subtree here.
        if (typeof Prism !== 'undefined' && Prism.highlightAllUnder) {
          Prism.highlightAllUnder(wrapper);
        }
        // Wire interactive checks now that the slide body is in the DOM.
        wireInteractiveChecks(wrapper);
        // Browsers don't execute <script> tags that arrive via innerHTML.
        // Re-create them as fresh script elements so inline slide JS runs.
        executeInlineScripts(wrapper);
      })
      .catch(function (err) {
        wrapper.innerHTML = '<p class="error">Could not load slide: ' + escapeHtml(err.message) + '</p>';
      });
    return wrapper;
  }

  /**
   * Re-create any <script> elements in `container` so their JS executes.
   * Inline scripts inserted via innerHTML are inert by browser design.
   * For each old <script>: clone its attributes (src, type, etc.) and inline
   * text into a fresh element, then swap them. The fresh element will be
   * fetched (if external) or evaluated (if inline).
   */
  function executeInlineScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(function (oldScript) {
      const fresh = document.createElement('script');
      Array.from(oldScript.attributes).forEach(function (attr) {
        fresh.setAttribute(attr.name, attr.value);
      });
      if (oldScript.textContent) {
        fresh.textContent = oldScript.textContent;
      }
      oldScript.parentNode.replaceChild(fresh, oldScript);
    });
  }

  /* ===== Runnable Pyodide sandbox =====================================
   *
   * One Pyodide Worker per learner session. Initialized lazily the first
   * time a sandbox renders. Kept alive across slide navigation so the
   * ~3-5s warm-up is paid once, not per slide.
   *
   * Each sandbox card is independent — its own editor, Run button, output
   * panel, and current-source state. Worker runs whatever code the active
   * sandbox sends; results route back to that sandbox by message id.
   *
   * Layout convention (locked in the review-module skill): inline-vertical.
   * The sandbox card lives in the natural flow of the slide where the
   * exercise belongs. No split-pane, no modal.
   * ====================================================================*/

  let pyodideWorker = null;
  let pyodideReady = false;
  let pyodideReadyWaiters = []; // queue of () -> void to fire when ready
  let pyodideLoadStarted = false;
  let nextSandboxRunId = 1;
  const sandboxesByRunId = {}; // runId -> { onStdout, onStderr, onDone, onError }

  function ensurePyodideWorker() {
    if (pyodideWorker) return pyodideWorker;
    pyodideLoadStarted = true;
    const workerSrc = [
      "let pyodide = null;",
      "let currentRunId = null;",
      "self.onmessage = async (e) => {",
      "  if (e.data.type === 'init') {",
      "    try {",
      "      importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js');",
      "      pyodide = await loadPyodide({",
      "        stdout: (t) => self.postMessage({ type: 'stdout', runId: currentRunId, text: t }),",
      "        stderr: (t) => self.postMessage({ type: 'stderr', runId: currentRunId, text: t })",
      "      });",
      "      self.postMessage({ type: 'ready', version: pyodide.version });",
      "    } catch (err) {",
      "      self.postMessage({ type: 'init-error', message: err.message || String(err) });",
      "    }",
      "  } else if (e.data.type === 'run' && pyodide) {",
      "    currentRunId = e.data.runId;",
      "    try {",
      "      // Reset namespace so each run starts clean — same-namespace persistence",
      "      // tends to confuse learners who change variable names mid-iteration.",
      "      pyodide.runPython('import sys; [sys.modules.pop(m, None) for m in list(sys.modules) if m.startswith(\"__sandbox_\")]');",
      "      await pyodide.runPythonAsync(e.data.code);",
      "      self.postMessage({ type: 'done', runId: currentRunId });",
      "    } catch (err) {",
      "      self.postMessage({ type: 'error', runId: currentRunId, message: err.message || String(err) });",
      "    }",
      "  }",
      "};"
    ].join('\n');
    const blob = new Blob([workerSrc], { type: 'application/javascript' });
    pyodideWorker = new Worker(URL.createObjectURL(blob));
    pyodideWorker.onmessage = function (e) {
      const m = e.data;
      if (m.type === 'ready') {
        pyodideReady = true;
        const waiters = pyodideReadyWaiters;
        pyodideReadyWaiters = [];
        waiters.forEach(function (w) { w(); });
        return;
      }
      if (m.type === 'init-error') {
        // Poison every waiter — Pyodide is unavailable.
        const waiters = pyodideReadyWaiters;
        pyodideReadyWaiters = [];
        waiters.forEach(function (w) { w(m.message); });
        return;
      }
      const handler = sandboxesByRunId[m.runId];
      if (!handler) return;
      if (m.type === 'stdout') handler.onStdout(m.text);
      else if (m.type === 'stderr') handler.onStderr(m.text);
      else if (m.type === 'done') {
        handler.onDone();
        delete sandboxesByRunId[m.runId];
      }
      else if (m.type === 'error') {
        handler.onError(m.message);
        delete sandboxesByRunId[m.runId];
      }
    };
    pyodideWorker.postMessage({ type: 'init' });
    return pyodideWorker;
  }

  function whenPyodideReady(cb) {
    ensurePyodideWorker();
    if (pyodideReady) { cb(); return; }
    pyodideReadyWaiters.push(cb);
  }

  function appendSandboxDisplay(parent, slide, code) {
    const slideEl = parent.querySelector('.slide') || parent;

    // Card structure:
    //   <div class="sandbox-card">
    //     <div class="sandbox-header"> title  •  Run/Reset buttons  </div>
    //     <textarea class="sandbox-editor" .../>
    //     <div class="sandbox-output-label">Output</div>
    //     <pre class="sandbox-output">…</pre>
    //   </div>
    const card = document.createElement('div');
    card.className = 'sandbox-card';

    const header = document.createElement('div');
    header.className = 'sandbox-header';
    const title = document.createElement('strong');
    title.textContent = 'Exercise: ' + (slide.title || 'Sandbox');
    const controls = document.createElement('div');
    controls.className = 'sandbox-controls';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'sandbox-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Restore the starter code';
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'sandbox-run-btn';
    runBtn.textContent = 'Loading Python…';
    runBtn.disabled = true;
    controls.appendChild(resetBtn);
    controls.appendChild(runBtn);
    header.appendChild(title);
    header.appendChild(controls);
    card.appendChild(header);

    const editor = document.createElement('textarea');
    editor.className = 'sandbox-editor';
    editor.spellcheck = false;
    editor.value = code;
    card.appendChild(editor);

    const outLabel = document.createElement('div');
    outLabel.className = 'sandbox-output-label';
    outLabel.textContent = 'Output';
    card.appendChild(outLabel);

    const out = document.createElement('pre');
    out.className = 'sandbox-output';
    out.textContent = '(click Run to execute)';
    out.dataset.empty = '1';
    card.appendChild(out);

    slideEl.appendChild(card);

    const starterCode = code;
    function appendOutput(text, isError) {
      if (out.dataset.empty === '1') {
        out.textContent = '';
        delete out.dataset.empty;
      }
      const span = document.createElement('span');
      if (isError) span.className = 'sandbox-output-error';
      span.textContent = text;
      if (!text.endsWith('\n')) span.textContent += '\n';
      out.appendChild(span);
      out.scrollTop = out.scrollHeight;
    }
    function clearOutput() {
      out.textContent = '';
      delete out.dataset.empty;
    }

    resetBtn.addEventListener('click', function () {
      editor.value = starterCode;
      out.textContent = '(click Run to execute)';
      out.dataset.empty = '1';
    });

    runBtn.addEventListener('click', function () {
      runBtn.disabled = true;
      runBtn.textContent = 'Running…';
      clearOutput();
      const runId = nextSandboxRunId++;
      sandboxesByRunId[runId] = {
        onStdout: function (t) { appendOutput(t, false); },
        onStderr: function (t) { appendOutput(t, true); },
        onDone: function () {
          runBtn.disabled = false;
          runBtn.textContent = 'Run';
          if (out.dataset.empty === '1') {
            out.textContent = '(no output — your code ran but did not print anything)';
          }
        },
        onError: function (msg) {
          appendOutput(msg, true);
          runBtn.disabled = false;
          runBtn.textContent = 'Run';
        }
      };
      pyodideWorker.postMessage({ type: 'run', runId: runId, code: editor.value });
    });

    whenPyodideReady(function (initError) {
      if (initError) {
        runBtn.textContent = 'Python unavailable';
        runBtn.disabled = true;
        out.textContent = 'Pyodide failed to load: ' + initError +
          '\n\nThis sandbox cannot run code without it. The starter code above is still readable.';
        out.dataset.empty = '0';
        return;
      }
      runBtn.disabled = false;
      runBtn.textContent = 'Run';
    });

    // Highlight the editor's syntax once on render. Prism doesn't highlight
    // inside textareas, so we treat the editor as plain. The sandbox card
    // border + monospace font keep code readable without highlighting.
  }

  function renderAssessment(screen) {
    const wrapper = document.createElement('div');
    wrapper.className = 'assessment';
    const heading = document.createElement('h2');
    heading.textContent = 'Module ' + (screen.moduleIndex + 1) + ' Assessment';
    wrapper.appendChild(heading);

    const intro = document.createElement('div');
    intro.className = 'assessment-intro';
    intro.innerHTML =
      '<p><strong>' + escapeHtml(course.title) + ' — ' + escapeHtml(screen.module.title) + '</strong></p>' +
      '<p>Passing score: ' + (screen.module.assessment.passing_score || 70) + '%. ' +
      'Answer all questions, then submit. You can retry if you do not pass.</p>';
    wrapper.appendChild(intro);

    const questionsContainer = document.createElement('div');
    questionsContainer.className = 'assessment-questions';
    wrapper.appendChild(questionsContainer);

    fetch('content/' + screen.module.assessment.file)
      .then(function (r) { return r.json(); })
      .then(function (assessment) {
        const submitted = assessmentSubmitted[screen.module.id] || false;
        renderQuestions(questionsContainer, screen.module, assessment, submitted);
      })
      .catch(function (err) {
        questionsContainer.innerHTML = '<p class="error">Could not load assessment: ' + escapeHtml(err.message) + '</p>';
      });

    return wrapper;
  }

  function renderQuestions(container, module, assessment, showResults) {
    container.innerHTML = '';
    const questions = pickQuestions(assessment, module);
    const moduleId = module.id;

    questions.forEach(function (q, qIdx) {
      const qEl = document.createElement('div');
      qEl.className = 'question';

      const prompt = document.createElement('div');
      prompt.className = 'question-prompt';
      prompt.innerHTML = '<strong>Question ' + (qIdx + 1) + '.</strong> ' + renderQuestionPrompt(q.prompt);
      qEl.appendChild(prompt);

      // Skip scenario / rubric questions in static SCORM
      if (q.type === 'scenario' || !q.options) {
        const skip = document.createElement('div');
        skip.className = 'question-explanation';
        skip.textContent = 'Open-ended scenario question — practice this in the FINRA-hosted platform for instructor-rubric scoring.';
        qEl.appendChild(skip);
        container.appendChild(qEl);
        return;
      }

      const list = document.createElement('ul');
      list.className = 'question-options';
      const isMultiSelect = q.type === 'multiple-select' || (Array.isArray(q.correct));
      const correctIds = Array.isArray(q.correct) ? q.correct : [q.correct];
      const inputName = moduleId + '-' + q.id;

      q.options.forEach(function (opt) {
        const li = document.createElement('li');
        li.className = 'question-option';
        const input = document.createElement('input');
        input.type = isMultiSelect ? 'checkbox' : 'radio';
        input.name = inputName;
        input.value = opt.id;
        input.id = inputName + '-' + opt.id;
        input.disabled = showResults;
        const selected = (assessmentSelections[q.id] || []).indexOf(opt.id) !== -1;
        if (selected) input.checked = true;
        input.addEventListener('change', function () {
          recordSelection(q.id, opt.id, isMultiSelect);
        });
        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.style.flex = '1';
        label.textContent = opt.text;
        li.appendChild(input);
        li.appendChild(label);
        if (showResults) {
          const isCorrect = correctIds.indexOf(opt.id) !== -1;
          if (isCorrect) li.classList.add('correct');
          if (selected && !isCorrect) li.classList.add('incorrect');
        }
        list.appendChild(li);
      });
      qEl.appendChild(list);

      if (showResults && q.explanation) {
        const exp = document.createElement('div');
        exp.className = 'question-explanation';
        exp.innerHTML = '<strong>Explanation:</strong> ' + escapeHtml(q.explanation);
        qEl.appendChild(exp);
      }

      container.appendChild(qEl);
    });

    if (showResults) {
      // State was already updated by submitAssessment() before render() was called.
      // Here we just visualize the results.
      const score = moduleScores[moduleId] != null ? moduleScores[moduleId] : 0;
      const passingScore = module.assessment.passing_score || 70;
      const passed = !!modulePassed[moduleId];

      const result = document.createElement('div');
      result.className = 'assessment-result ' + (passed ? 'passed' : 'failed');
      result.innerHTML =
        '<h3>' + (passed ? 'Passed' : 'Not yet') + '</h3>' +
        '<div class="score">' + score + '%</div>' +
        '<p>' + (passed ? 'You met the passing score for this module.' : 'You need ' + passingScore + '% or higher to advance. Review the explanations and try again.') + '</p>';
      container.appendChild(result);

      const actions = document.createElement('div');
      actions.style.textAlign = 'center';
      actions.style.marginTop = 'var(--space-lg)';
      if (!passed) {
        const retry = document.createElement('button');
        retry.className = 'btn btn-primary';
        retry.textContent = 'Retry Assessment';
        retry.addEventListener('click', function () {
          assessmentSubmitted[moduleId] = false;
          questions.forEach(function (q) { delete assessmentSelections[q.id]; });
          render();
        });
        actions.appendChild(retry);
      }
      container.appendChild(actions);
    } else {
      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn btn-primary';
      submitBtn.textContent = 'Submit Assessment';
      submitBtn.style.marginTop = 'var(--space-lg)';
      submitBtn.addEventListener('click', function () {
        if (!allAnswered(questions)) {
          alert('Please answer every question before submitting.');
          return;
        }
        // Mutate state synchronously, then re-render the whole screen so
        // the footer's Next button reflects the new modulePassed value.
        submitAssessment(module, questions);
        render();
      });
      container.appendChild(submitBtn);
    }
  }

  function renderQuestionPrompt(prompt) {
    // Convert simple ```python code blocks into <pre><code> blocks; otherwise escape.
    const parts = prompt.split(/```(?:python)?\n?/);
    if (parts.length === 1) return escapeHtml(prompt);
    let out = '';
    for (let i = 0; i < parts.length; i += 1) {
      if (i % 2 === 0) {
        out += escapeHtml(parts[i]).replace(/\n/g, '<br>');
      } else {
        out += '<pre><code class="language-python">' + escapeHtml(parts[i]) + '</code></pre>';
      }
    }
    return out;
  }

  function pickQuestions(assessment, module) {
    // New shape: slots with variants. For each slot, pick one variant
    // based on attempt count so retakes rotate through variants
    // deterministically.
    if (Array.isArray(assessment.slots) && assessment.slots.length > 0) {
      const attempts = (module && assessmentAttempts[module.id]) || 0;
      return assessment.slots
        .map(function (slot) {
          const variants = Array.isArray(slot.variants) ? slot.variants : [];
          if (variants.length === 0) return null;
          const v = variants[attempts % variants.length];
          // Surface slot-level fields on the question so renderQuestions
          // and computeScore work without changes.
          return Object.assign({}, v, {
            type: v.type || slot.type,
            slot_id: slot.id,
            skill: slot.skill
          });
        })
        .filter(function (q) { return q !== null; });
    }
    // Legacy shape: flat pool. Take the first N deterministically.
    const pool = assessment.pool || [];
    const target = assessment.questions_per_attempt || pool.length;
    if (target >= pool.length) return pool;
    return pool.slice(0, target);
  }

  function submitAssessment(module, questions) {
    // Compute score and update state synchronously so a subsequent render()
    // sees the new modulePassed value when re-rendering the footer.
    const moduleId = module.id;
    const score = computeScore(module, questions);
    const passingScore = module.assessment.passing_score || 70;
    moduleScores[moduleId] = score;
    modulePassed[moduleId] = score >= passingScore;
    assessmentSubmitted[moduleId] = true;
    // Per-question reporting to LMS so Docebo can show interaction-level
    // performance. This must happen before bumping the attempt counter
    // so the interaction id reflects the attempt that just finished.
    recordInteractionsForAttempt(module, questions);
    // Bump attempt counter so a subsequent retake picks the next variant.
    assessmentAttempts[moduleId] = (assessmentAttempts[moduleId] || 0) + 1;
    persistProgress();
    reportProgressIfPassed();
  }

  function recordInteractionsForAttempt(module, questions) {
    if (!window.ScormAPI || !window.ScormAPI.recordInteraction) return;
    const attempt = (assessmentAttempts[module.id] || 0) + 1;
    questions.forEach(function (q) {
      // Skip questions the player can't grade.
      if (q.type === 'scenario' || !q.options) return;
      const correctIds = Array.isArray(q.correct) ? q.correct.slice().sort() : [q.correct];
      const selected = (assessmentSelections[q.id] || []).slice().sort();
      const isCorrect =
        selected.length === correctIds.length &&
        selected.every(function (v, i) { return v === correctIds[i]; });
      // SCORM 1.2 type field — most question types map to 'choice'.
      let scormType = 'choice';
      if (q.type === 'fill-in') scormType = 'fill-in';
      if (q.type === 'numeric') scormType = 'numeric';
      // Stable id: module/slot.variant or module/q-id, plus attempt number.
      const baseId = q.slot_id ? (q.slot_id + '.' + q.id) : q.id;
      const interactionId = module.id + '/' + baseId + '#a' + attempt;
      const startedAt = questionStartTimes[q.id];
      const latencyMs = startedAt ? (Date.now() - startedAt) : null;
      window.ScormAPI.recordInteraction({
        id: interactionId,
        type: scormType,
        student_response: selected.join(','),
        correct_response: correctIds.join(','),
        result: isCorrect ? 'correct' : 'wrong',
        weighting: 1,
        latency_ms: latencyMs
      });
    });
  }

  function recordSelection(questionId, optionId, isMultiSelect) {
    // Stamp first-engagement time so we can report latency to the LMS.
    if (!questionStartTimes[questionId]) {
      questionStartTimes[questionId] = Date.now();
    }
    if (isMultiSelect) {
      const cur = assessmentSelections[questionId] || [];
      const idx = cur.indexOf(optionId);
      if (idx >= 0) cur.splice(idx, 1);
      else cur.push(optionId);
      assessmentSelections[questionId] = cur;
    } else {
      assessmentSelections[questionId] = [optionId];
    }
  }

  function allAnswered(questions) {
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (q.type === 'scenario' || !q.options) continue;
      if (!assessmentSelections[q.id] || assessmentSelections[q.id].length === 0) return false;
    }
    return true;
  }

  function computeScore(module, questions) {
    let correct = 0;
    let scorable = 0;
    questions.forEach(function (q) {
      if (q.type === 'scenario' || !q.options) return;
      scorable += 1;
      const correctIds = Array.isArray(q.correct) ? q.correct.slice().sort() : [q.correct];
      const selected = (assessmentSelections[q.id] || []).slice().sort();
      if (selected.length === correctIds.length && selected.every(function (v, i) { return v === correctIds[i]; })) {
        correct += 1;
      }
    });
    return scorable === 0 ? 0 : Math.round((correct / scorable) * 100);
  }

  function reportProgressIfPassed() {
    const passedCount = Object.keys(modulePassed).filter(function (k) { return modulePassed[k]; }).length;
    if (passedCount === course.modules.length) {
      const avg = averageScore();
      window.ScormAPI.setScore(avg, 0, 100);
      window.ScormAPI.setStatus(avg >= 70 ? 'passed' : 'failed');
    } else {
      window.ScormAPI.setStatus('incomplete');
    }
  }

  function averageScore() {
    const scores = Object.values(moduleScores);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length);
  }

  function renderCompletion() {
    const wrapper = document.createElement('div');
    wrapper.className = 'completion-screen';
    const passedAll = course.modules.every(function (m) { return modulePassed[m.id]; });
    const heading = document.createElement('h2');
    heading.textContent = passedAll ? '🎉 Course Complete' : 'Almost there';
    wrapper.appendChild(heading);

    const summary = document.createElement('p');
    if (passedAll) {
      const avg = averageScore();
      summary.textContent = 'You passed all modules with an average score of ' + avg + '%. Your completion has been reported to the LMS.';
    } else {
      summary.textContent = 'You have not yet passed every module. Review the modules you missed and retake the assessments.';
    }
    wrapper.appendChild(summary);

    const list = document.createElement('ul');
    list.className = 'module-scores';
    list.style.listStyle = 'none';
    course.modules.forEach(function (mod, idx) {
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = 'Module ' + (idx + 1) + ': ' + mod.title;
      const right = document.createElement('strong');
      const score = moduleScores[mod.id];
      if (score == null) {
        right.textContent = 'Not attempted';
        right.style.color = 'var(--color-text-muted)';
      } else if (modulePassed[mod.id]) {
        right.textContent = score + '% — Passed';
        right.style.color = 'var(--color-success)';
      } else {
        right.textContent = score + '% — Below ' + (mod.assessment.passing_score || 70) + '%';
        right.style.color = 'var(--color-error)';
      }
      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });
    wrapper.appendChild(list);

    return wrapper;
  }

  function renderFooter(screen) {
    const footer = document.createElement('footer');
    footer.className = 'player-footer';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn';
    prevBtn.textContent = '← Previous';
    prevBtn.disabled = currentIndex === 0;
    prevBtn.addEventListener('click', goPrev);

    const counter = document.createElement('span');
    counter.className = 'player-counter';
    if (screen.kind === 'slide') {
      const slideIdx = screen.module.slides.indexOf(screen.slide) + 1;
      const total = screen.module.slides.length;
      counter.textContent = 'Slide ' + slideIdx + ' of ' + total;
    } else if (screen.kind === 'assessment') {
      counter.textContent = 'Module ' + (screen.moduleIndex + 1) + ' check';
    } else {
      counter.textContent = 'Summary';
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    if (screen.kind === 'completion') {
      nextBtn.textContent = 'Close';
      nextBtn.addEventListener('click', function () {
        window.ScormAPI.finish();
        try { window.close(); } catch (e) { /* ignore */ }
      });
    } else if (screen.kind === 'assessment') {
      const passed = modulePassed[screen.module.id];
      nextBtn.textContent = 'Next →';
      nextBtn.disabled = !passed;
      nextBtn.title = passed ? '' : 'Pass this assessment to advance.';
      nextBtn.addEventListener('click', goNext);
    } else {
      nextBtn.textContent = 'Next →';
      nextBtn.disabled = currentIndex >= screens.length - 1;
      nextBtn.addEventListener('click', goNext);
    }

    footer.appendChild(prevBtn);
    footer.appendChild(counter);
    footer.appendChild(nextBtn);
    return footer;
  }

  function goPrev() {
    if (currentIndex > 0) {
      currentIndex -= 1;
      persistProgress();
      render();
    }
  }

  function goNext() {
    if (currentIndex < screens.length - 1) {
      currentIndex += 1;
      persistProgress();
      render();
    }
  }

  // ---------- Utilities ----------

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showError(err) {
    const root = document.getElementById('app');
    root.innerHTML = '<div style="padding:2rem;color:var(--color-error)">' +
      '<h2>Course failed to load</h2><p>' + escapeHtml(err.message || String(err)) + '</p></div>';
  }
})();
