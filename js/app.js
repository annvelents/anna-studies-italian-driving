/* ============================================================
   app.js — screens, session runtime, and everything DOM.
   ============================================================ */

(function () {
  'use strict';

  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var CAT_LABEL = {
    segnaletica:   'Signs & road layout',
    comportamento: 'Conduct & precedence',
    veicolo:       'The vehicle',
    documenti:     'Documents & penalties',
    sicurezza:     'Safety & first aid',
    linguaggio:    'Exam language',
    altro:         'Other'
  };

  var MODE_HINT = {
    'it-en': 'Read the Italian, pick the English. This is the direction the exam itself demands.',
    'en-it': 'Read the English, pick the Italian. Harder — it forces real recall instead of recognition.',
    'mixed': 'Both directions, shuffled. The best final-week check that a word is genuinely yours.',
    'cloze': 'A real exam-style sentence with one word removed. Trains reading the statement, not just the word.'
  };

  var FOCUS_HINT = {
    smart: 'Weights the session toward what you have missed, what you have never seen, and the hardest words.',
    weak:  'Only words you have already got wrong or have not yet answered right twice in a row.',
    new:   'Only words this browser has never shown you before.',
    hard:  'Only the words marked hardest — false friends, legal register, and confusable pairs.'
  };

  var MODE_KICKER = {
    'it-en': 'Italian → English',
    'en-it': 'English → Italian',
    'cloze': 'Fill the gap'
  };

  /* ---------------- setup state ---------------- */

  var setup = {
    mode:  'it-en',
    focus: 'smart',
    cats:  [],          // empty = all
    length: 30
  };

  /* ---------------- session state ---------------- */

  var S = null;

  /* ---------------- boot ---------------- */

  function boot() {
    Quiz.prepare(window.VOCAB || []);
    initTheme();
    buildCatChips();
    wire();
    refreshSetup();
    renderBrowse('');
    $('#deck-size').textContent = Quiz.all().length + ' words in the deck';
  }

  /* ---------------- theme ---------------- */

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('patente-vocab.theme'); } catch (e) {}
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
    $('#theme-toggle').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      if (!cur) {
        var prefersDark = window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches;
        cur = prefersDark ? 'dark' : 'light';
      }
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('patente-vocab.theme', next); } catch (e) {}
    });
  }

  /* ---------------- setup screen ---------------- */

  function buildCatChips() {
    var row = $('#cat-row');
    var cats = Quiz.categories().sort(function (a, b) {
      return (CAT_LABEL[a] || a).localeCompare(CAT_LABEL[b] || b);
    });

    var allChip = document.createElement('button');
    allChip.className = 'chip';
    allChip.type = 'button';
    allChip.setAttribute('aria-pressed', 'true');
    allChip.dataset.cat = '*';
    allChip.textContent = 'Everything';
    row.appendChild(allChip);

    cats.forEach(function (c) {
      var n = Quiz.pool([c]).length;
      var b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.dataset.cat = c;
      b.innerHTML = '';
      b.appendChild(document.createTextNode(CAT_LABEL[c] || c));
      var span = document.createElement('span');
      span.className = 'chip-count';
      span.textContent = n;
      b.appendChild(span);
      row.appendChild(b);
    });

    row.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.chip');
      if (!btn) return;

      if (btn.dataset.cat === '*') {
        setup.cats = [];
      } else {
        var c = btn.dataset.cat;
        var i = setup.cats.indexOf(c);
        if (i === -1) setup.cats.push(c); else setup.cats.splice(i, 1);
      }
      syncCatChips();
      refreshSetup();
    });
  }

  function syncCatChips() {
    $$('#cat-row .chip').forEach(function (b) {
      var on = b.dataset.cat === '*'
        ? setup.cats.length === 0
        : setup.cats.indexOf(b.dataset.cat) !== -1;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function radioRow(sel, key, onChange) {
    $(sel).addEventListener('click', function (ev) {
      var btn = ev.target.closest('.chip');
      if (!btn) return;
      $$(sel + ' .chip').forEach(function (b) {
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });
      setup[key] = btn.dataset[key];
      if (onChange) onChange();
      refreshSetup();
    });
  }

  function refreshSetup() {
    var ids = Quiz.pool(setup.cats).map(function (e) { return e.id; });
    var st = Store.stats(ids);

    $('#stat-known').textContent    = st.solid;
    $('#stat-shaky').textContent    = st.shaky;
    $('#stat-unseen').textContent   = st.unseen;
    $('#stat-sessions').textContent = st.sessions;
    $('#mastery-fill').style.width  = st.pct + '%';
    $('#mastery-pct').textContent   = st.pct + '%';

    var streak = Store.currentStreak();
    $('#streak-chip').hidden = streak < 2;
    $('#streak-count').textContent = streak;

    $('#mode-hint').textContent  = MODE_HINT[setup.mode];
    $('#focus-hint').textContent = FOCUS_HINT[setup.focus];

    var avail = setup.mode === 'cloze'
      ? Quiz.clozeCount(setup.cats)
      : ids.length;

    $('#pool-count').textContent = setup.cats.length
      ? ids.length + ' selected'
      : ids.length + ' words';

    var want = setup.length;
    var btn = $('#btn-start');
    btn.firstChild.nodeValue = 'Start ' + Math.min(want, avail) + ' questions';
    btn.disabled = avail < 4;

    var note = '';
    if (avail < 4) {
      note = 'Pick at least one topic with four or more words.';
    } else if (avail < want) {
      note = 'Only ' + avail + ' words match this selection, so the session will be ' + avail + ' long.';
    } else if (setup.focus === 'new' && st.unseen === 0) {
      note = 'You have seen every word in this selection at least once — this will fall back to the smart mix.';
    } else if (setup.focus === 'weak' && st.shaky === 0) {
      note = st.sessions === 0
        ? 'Nothing marked weak yet. Run a session first and this fills itself in.'
        : 'No weak words left in this selection — nicely done. Falling back to the smart mix.';
    }
    $('#start-note').textContent = note;
  }

  /* ---------------- browse ---------------- */

  function renderBrowse(query) {
    var list = $('#browse-list');
    var q = Quiz.fold(query.trim());
    var rows = Quiz.all();

    if (q) {
      rows = rows.filter(function (e) {
        return Quiz.fold(e.it).indexOf(q) !== -1 || Quiz.fold(e.en).indexOf(q) !== -1;
      });
    }
    rows = rows.slice().sort(function (a, b) { return a.it.localeCompare(b.it, 'it'); });

    list.textContent = '';
    if (!rows.length) {
      var p = document.createElement('p');
      p.className = 'browse-empty';
      p.textContent = 'No word matches “' + query.trim() + '”.';
      list.appendChild(p);
      return;
    }

    var frag = document.createDocumentFragment();
    rows.forEach(function (e) {
      var r = Store.get(e.id);
      var div = document.createElement('div');
      div.className = 'brow';

      var dot = document.createElement('span');
      dot.className = 'brow-dot' + (r.streak >= 2 ? ' ok' : (r.s > 0 ? ' bad' : ''));
      dot.title = r.s === 0 ? 'Not yet seen'
                : r.streak >= 2 ? 'Solid' : 'Still shaky';
      div.appendChild(dot);

      var it = document.createElement('span');
      it.className = 'brow-it';
      it.textContent = e.it;
      div.appendChild(it);

      var en = document.createElement('span');
      en.className = 'brow-en';
      en.textContent = e.en;
      div.appendChild(en);

      frag.appendChild(div);
    });
    list.appendChild(frag);
  }

  /* ---------------- navigation ---------------- */

  function show(name) {
    $$('.screen').forEach(function (s) { s.classList.remove('is-active'); });
    $('#screen-' + name).classList.add('is-active');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ---------------- session ---------------- */

  function startSession(questions, meta) {
    S = {
      qs: questions,
      i: 0,
      correct: 0,
      wrong: 0,
      missed: [],
      answered: false,
      mode: meta.mode,
      isExamLength: questions.length === 30
    };
    $('#q-total').textContent = questions.length;
    $('#budget-chip').hidden = !S.isExamLength;
    show('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    var q = S.qs[S.i];
    S.answered = false;

    $('#q-index').textContent = S.i + 1;
    $('#progress-fill').style.width = ((S.i) / S.qs.length * 100) + '%';
    $('#tally-correct').textContent = S.correct;
    $('#tally-wrong').textContent = S.wrong;

    var budget = $('#budget-chip');
    if (S.isExamLength) {
      var left = 3 - S.wrong;
      budget.textContent = left >= 0
        ? left + ' miss' + (left === 1 ? '' : 'es') + ' left at exam standard'
        : 'Past the 3-miss exam limit';
      budget.classList.toggle('over', left < 0);
    }

    $('#card-kicker').textContent = MODE_KICKER[q.kind] || '';

    var promptEl = $('#prompt');
    var subEl = $('#prompt-sub');
    promptEl.textContent = '';
    subEl.textContent = '';

    if (q.kind === 'cloze') {
      promptEl.classList.add('is-sentence');
      promptEl.appendChild(document.createTextNode(q.prompt.before));
      var blank = document.createElement('span');
      blank.className = 'blank';
      blank.innerHTML = '&nbsp;';
      promptEl.appendChild(blank);
      promptEl.appendChild(document.createTextNode(q.prompt.after));
      subEl.textContent = 'Which word belongs in the gap?';
    } else {
      promptEl.classList.remove('is-sentence');
      promptEl.textContent = q.prompt;
      if (q.kind === 'en-it') subEl.textContent = 'Give the Italian.';
    }

    var box = $('#options');
    box.textContent = '';
    q.options.forEach(function (opt, idx) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.type = 'button';

      var k = document.createElement('span');
      k.className = 'opt-key';
      k.textContent = idx + 1;
      b.appendChild(k);

      var t = document.createElement('span');
      t.className = 'opt-text';
      t.textContent = opt.text;
      b.appendChild(t);

      b.addEventListener('click', function () { answer(idx); });
      box.appendChild(b);
    });

    $('#feedback').hidden = true;
    $('#btn-next').hidden = true;
  }

  function answer(idx) {
    if (S.answered) return;
    S.answered = true;

    var q = S.qs[S.i];
    var chosen = q.options[idx];
    var ok = chosen.correct;

    Store.record(q.entry.id, ok);
    Store.save();

    if (ok) S.correct++;
    else {
      S.wrong++;
      S.missed.push({ entry: q.entry, chose: chosen.text, kind: q.kind });
    }

    $$('#options .opt').forEach(function (b, i) {
      b.disabled = true;
      if (q.options[i].correct) b.classList.add('correct');
      else if (i === idx) b.classList.add('wrong');
      else b.classList.add('muted');
    });

    showFeedback(q, ok);

    $('#tally-correct').textContent = S.correct;
    $('#tally-wrong').textContent = S.wrong;
    $('#progress-fill').style.width = ((S.i + 1) / S.qs.length * 100) + '%';

    var next = $('#btn-next');
    next.hidden = false;
    next.firstChild.nodeValue = (S.i === S.qs.length - 1) ? 'See results ' : 'Next ';
    next.focus({ preventScroll: true });
  }

  function showFeedback(q, ok) {
    var fb = $('#feedback');
    fb.className = 'feedback ' + (ok ? 'good' : 'bad');
    fb.hidden = false;

    $('#fb-verdict').textContent = ok ? 'Correct' : 'Not quite';

    var ans = $('#fb-answer');
    if (ok) {
      ans.textContent = q.kind === 'it-en'
        ? q.entry.it + ' — ' + q.entry.en
        : q.entry.en + ' — ' + q.entry.it;
    } else {
      ans.textContent = q.entry.it + ' — ' + q.entry.en;
    }

    $('#fb-note').textContent = q.entry.note || '';

    var ex = $('#fb-ex');
    ex.textContent = '';
    if (q.entry.ex) {
      if (q.entry.cloze) {
        ex.appendChild(document.createTextNode(q.entry.cloze.before));
        var b = document.createElement('b');
        b.textContent = q.entry.cloze.surface;
        ex.appendChild(b);
        ex.appendChild(document.createTextNode(q.entry.cloze.after));
      } else {
        ex.textContent = q.entry.ex;
      }
    }
  }

  function nextQuestion() {
    if (S.i === S.qs.length - 1) return finish();
    S.i++;
    renderQuestion();
  }

  /* ---------------- results ---------------- */

  function finish() {
    Store.finishSession({ total: S.qs.length, correct: S.correct, mode: S.mode });

    var pct = Math.round(S.correct / S.qs.length * 100);
    $('#res-pct').textContent = pct;

    var ring = $('#ring');
    var passed = S.wrong <= 3;
    ring.classList.toggle('fail', !passed);
    // let the browser paint 0 first so the ring animates
    $('#ring-fg').style.strokeDashoffset = 326.7;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        $('#ring-fg').style.strokeDashoffset = 326.7 * (1 - pct / 100);
      });
    });

    $('#res-title').textContent =
      pct === 100 ? 'Perfect run' :
      passed      ? 'Solid session' :
                    'Good — now the useful part';

    $('#res-sub').textContent =
      S.correct + ' of ' + S.qs.length + ' correct' +
      (S.wrong ? ', ' + S.wrong + ' to revisit.' : '.');

    var vl = $('#verdict-line');
    if (S.isExamLength) {
      vl.hidden = false;
      vl.className = 'verdict-line ' + (passed ? 'pass' : 'fail');
      vl.textContent = passed
        ? 'At exam standard: 3 misses allowed, you had ' + S.wrong + '.'
        : S.wrong + ' misses — the real exam allows 3.';
    } else {
      vl.hidden = true;
    }

    var wrap = $('#missed-wrap');
    var list = $('#missed-list');
    list.textContent = '';

    if (S.missed.length) {
      wrap.hidden = false;
      $('#missed-count').textContent = S.missed.length + ' word' + (S.missed.length === 1 ? '' : 's');

      S.missed.forEach(function (m) {
        var d = document.createElement('div');
        d.className = 'missed';

        var head = document.createElement('div');
        head.className = 'missed-head';
        var it = document.createElement('span');
        it.className = 'missed-it';
        it.textContent = m.entry.it;
        var en = document.createElement('span');
        en.className = 'missed-en';
        en.textContent = m.entry.en;
        head.appendChild(it); head.appendChild(en);
        d.appendChild(head);

        var you = document.createElement('p');
        you.className = 'missed-you';
        you.textContent = 'You chose: ' + m.chose;
        d.appendChild(you);

        if (m.entry.note) {
          var n = document.createElement('p');
          n.className = 'missed-note';
          n.textContent = m.entry.note;
          d.appendChild(n);
        }
        list.appendChild(d);
      });
      $('#btn-retry-missed').hidden = false;
    } else {
      wrap.hidden = true;
      $('#btn-retry-missed').hidden = true;
    }

    show('results');
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    radioRow('#mode-row', 'mode');
    radioRow('#focus-row', 'focus');

    $('#session-len').addEventListener('change', function () {
      setup.length = parseInt(this.value, 10) || 30;
      refreshSetup();
    });

    $('#btn-start').addEventListener('click', function () {
      var qs = Quiz.build(setup);
      if (!qs.length) return;
      startSession(qs, { mode: setup.mode });
    });

    $('#btn-next').addEventListener('click', nextQuestion);

    $('#btn-quit').addEventListener('click', function () {
      if (S && S.i > 0 && !confirm('End this session? Answers so far are already saved.')) return;
      refreshSetup();
      renderBrowse($('#browse-search').value || '');
      show('setup');
    });

    $('#btn-again').addEventListener('click', function () {
      startSession(Quiz.build(setup), { mode: setup.mode });
    });

    $('#btn-retry-missed').addEventListener('click', function () {
      var entries = S.missed.map(function (m) { return m.entry; });
      startSession(Quiz.buildFrom(entries, setup), { mode: setup.mode });
    });

    $('#btn-home').addEventListener('click', function () {
      refreshSetup();
      renderBrowse($('#browse-search').value || '');
      show('setup');
    });

    $('.brand').addEventListener('click', function (ev) {
      ev.preventDefault();
      if (S && $('#screen-quiz').classList.contains('is-active') && S.i > 0 &&
          !confirm('End this session? Answers so far are already saved.')) return;
      refreshSetup();
      renderBrowse($('#browse-search').value || '');
      show('setup');
    });

    $('#browse-search').addEventListener('input', function () {
      renderBrowse(this.value);
    });

    $('#btn-reset').addEventListener('click', function () {
      if (!confirm('Clear every word score, streak and session from this browser? This cannot be undone.')) return;
      Store.reset();
      refreshSetup();
      renderBrowse($('#browse-search').value || '');
    });

    document.addEventListener('keydown', function (ev) {
      if (!$('#screen-quiz').classList.contains('is-active')) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      var tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      if (!S.answered && ev.key >= '1' && ev.key <= '4') {
        ev.preventDefault();
        answer(parseInt(ev.key, 10) - 1);
      } else if (S.answered && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        nextQuestion();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
