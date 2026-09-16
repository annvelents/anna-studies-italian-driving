/* ============================================================
   storage.js — per-word progress, kept in this browser only.
   Every read/write is guarded: private windows and blocked
   site-data make localStorage throw rather than return null.
   ============================================================ */

var Store = (function () {
  'use strict';

  var KEY = 'patente-vocab.progress.v1';

  var blank = {
    words: {},        // id -> { s, c, w, streak, last }
    sessions: 0,
    streakDays: 0,
    lastDay: null,
    history: []       // [{ ts, total, correct, mode }]
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(blank);
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return clone(blank);
      // merge so a newer field added later doesn't break an old save
      var out = clone(blank);
      if (parsed.words && typeof parsed.words === 'object') out.words = parsed.words;
      if (typeof parsed.sessions === 'number') out.sessions = parsed.sessions;
      if (typeof parsed.streakDays === 'number') out.streakDays = parsed.streakDays;
      if (typeof parsed.lastDay === 'string') out.lastDay = parsed.lastDay;
      if (Array.isArray(parsed.history)) out.history = parsed.history.slice(-100);
      return out;
    } catch (e) {
      return clone(blank);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* quota, private mode, blocked — study still works */ }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function daysBetween(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    var da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    var db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((db - da) / 86400000);
  }

  /* ---- word-level record ---- */

  function rec(id) {
    var r = state.words[id];
    if (!r) r = state.words[id] = { s: 0, c: 0, w: 0, streak: 0, last: 0 };
    return r;
  }

  function get(id) {
    return state.words[id] || { s: 0, c: 0, w: 0, streak: 0, last: 0 };
  }

  function record(id, wasCorrect) {
    var r = rec(id);
    r.s += 1;
    r.last = Date.now();
    if (wasCorrect) { r.c += 1; r.streak += 1; }
    else { r.w += 1; r.streak = 0; }
  }

  /* A word counts as "solid" once it has been answered right twice
     in a row — one lucky guess out of four is not knowing it. */
  function isSolid(id) { return get(id).streak >= 2; }
  function isShaky(id) { var r = get(id); return r.s > 0 && r.streak < 2; }
  function isUnseen(id) { return get(id).s === 0; }

  /* ---- session bookkeeping ---- */

  function finishSession(summary) {
    state.sessions += 1;
    state.history.push({
      ts: Date.now(),
      total: summary.total,
      correct: summary.correct,
      mode: summary.mode
    });
    if (state.history.length > 100) state.history = state.history.slice(-100);

    var t = today();
    if (state.lastDay === null) {
      state.streakDays = 1;
    } else if (state.lastDay !== t) {
      var gap = daysBetween(state.lastDay, t);
      state.streakDays = (gap === 1) ? state.streakDays + 1 : 1;
    } else if (state.streakDays === 0) {
      state.streakDays = 1;
    }
    state.lastDay = t;
    save();
  }

  /* A streak only counts if it is current: studied today, or
     yesterday and still live. Otherwise it has lapsed. */
  function currentStreak() {
    if (!state.lastDay) return 0;
    var gap = daysBetween(state.lastDay, today());
    return gap <= 1 ? state.streakDays : 0;
  }

  function stats(ids) {
    var solid = 0, shaky = 0, unseen = 0;
    for (var i = 0; i < ids.length; i++) {
      var r = get(ids[i]);
      if (r.s === 0) unseen++;
      else if (r.streak >= 2) solid++;
      else shaky++;
    }
    return {
      solid: solid, shaky: shaky, unseen: unseen,
      total: ids.length,
      sessions: state.sessions,
      streak: currentStreak(),
      pct: ids.length ? Math.round((solid / ids.length) * 100) : 0
    };
  }

  function reset() {
    state = clone(blank);
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  return {
    get: get,
    record: record,
    save: save,
    isSolid: isSolid,
    isShaky: isShaky,
    isUnseen: isUnseen,
    finishSession: finishSession,
    currentStreak: currentStreak,
    stats: stats,
    reset: reset
  };
})();
