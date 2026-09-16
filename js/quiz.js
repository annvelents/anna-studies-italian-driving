/* ============================================================
   quiz.js — deck preparation, question building, distractors.
   Pure logic: no DOM access lives in here.
   ============================================================ */

var Quiz = (function () {
  'use strict';

  /* ---------------------------------------------------------
     Text helpers
     --------------------------------------------------------- */

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function slug(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function fold(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var ARTICLE_RE = /^(l'|un'|la |le |il |lo |i |gli |un |uno |una |dei |degli |delle |del |della |dello |ai |al |alla |allo )/i;

  /* Gender/number variants of the final word, so "la sosta" can be
     found in a sentence that says "le soste". Forms that aren't real
     Italian simply never match, so a bad guess costs nothing. */
  function inflections(w) {
    if (w.length < 4) return [];
    var stem = w.slice(0, -1), end = w.slice(-1).toLowerCase();
    if (end === 'a') return [stem + 'e', stem + 'i', stem + 'o'];
    if (end === 'o') return [stem + 'i', stem + 'a', stem + 'e'];
    if (end === 'e') return [stem + 'i', stem + 'a', stem + 'o'];
    if (end === 'i') return [stem + 'o', stem + 'e', stem + 'a'];
    return [];
  }

  var TRAIL_PREP = /\s+(di|a|da|in|su|con|per|del|della|dei|degli|delle)$/i;

  function surfaceForms(phrase) {
    var exact = [], loose = [];
    var base = phrase.trim();

    // "dispositivo antibloccaggio (ABS)" -> also try each half alone
    var paren = base.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    var stems = [base];
    if (paren) {
      // "(a)" in "spettare (a)" is a bare preposition — blanking it teaches
      // nothing, so only parentheticals with real substance are candidates.
      if (paren[1].trim().length >= 3) stems.push(paren[1].trim());
      if (paren[2].trim().length >= 3) stems.push(paren[2].trim());
    }

    stems.slice().forEach(function (s) {
      var noArt = s.replace(ARTICLE_RE, '').trim();
      if (noArt && stems.indexOf(noArt) === -1) stems.push(noArt);
    });

    stems.forEach(function (s) {
      if (!s) return;
      exact.push(s);

      // "al di sotto di" also turns up as "al di sotto del quale"
      var trimmed = s.replace(TRAIL_PREP, '');
      if (trimmed !== s && trimmed.split(/\s+/).length > 1) exact.push(trimmed);
    });

    // Gender/number variants. Italian pluralises the HEAD noun, which in
    // "cintura di sicurezza" is the first word, not the last — so try both
    // ends rather than only the tail.
    exact.slice().forEach(function (s) {
      var parts = s.split(/\s+/);
      if (!parts.length) return;

      inflections(parts[parts.length - 1]).forEach(function (v) {
        loose.push(parts.slice(0, -1).concat(v).join(' '));
      });

      if (parts.length > 1) {
        inflections(parts[0]).forEach(function (v) {
          loose.push([v].concat(parts.slice(1)).join(' '));
        });
      }
    });

    var byLen = function (a, b) { return b.length - a.length; };
    var uniq = function (a) {
      var seen = {}, out = [];
      a.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
      return out;
    };
    return { exact: uniq(exact).sort(byLen), loose: uniq(loose).sort(byLen) };
  }

  /* Locate the target phrase inside its own example sentence.
     Returns {start,len} or null if the sentence doesn't contain it. */
  function locate(phrase, sentence) {
    var forms = surfaceForms(phrase);
    var tiers = [forms.exact, forms.loose];

    for (var t = 0; t < tiers.length; t++) {
      for (var i = 0; i < tiers[t].length; i++) {
        var cand = tiers[t][i];
        if (!cand) continue;
        var re;
        try {
          re = new RegExp(
            '(^|[^\\p{L}\\p{M}])(' + escapeRe(cand) + ')(?![\\p{L}\\p{M}])',
            'iu'
          );
        } catch (e) {
          re = new RegExp('(^|[^a-zA-Zà-ùÀ-Ù])(' + escapeRe(cand) + ')(?![a-zA-Zà-ùÀ-Ù])', 'i');
        }
        var m = re.exec(sentence);
        if (m && m[2].length >= 3) return { start: m.index + m[1].length, len: m[2].length };
      }
    }
    return null;
  }

  /* ---------------------------------------------------------
     Deck preparation
     --------------------------------------------------------- */

  var deck = [];
  var byCat = {};

  function prepare(raw) {
    var seen = {};
    deck = [];

    raw.forEach(function (e) {
      if (!e || !e.it || !e.en) return;
      var id = slug(e.it);
      if (!id || seen[id]) return;       // drop duplicates across research batches
      seen[id] = true;

      var entry = {
        id: id,
        it: e.it,
        en: e.en,
        cat: e.cat || 'altro',
        diff: e.diff || 2,
        note: e.note || '',
        ex: e.ex || '',
        enKey: fold(e.en.replace(/\s*\([^)]*\)\s*/g, ' ').split(/\s*[/;]\s*/)[0]).trim(),
        cloze: null
      };

      if (entry.ex) {
        var hit = locate(entry.it, entry.ex);
        if (hit) {
          entry.cloze = {
            before: entry.ex.slice(0, hit.start),
            after: entry.ex.slice(hit.start + hit.len),
            surface: entry.ex.substr(hit.start, hit.len)
          };
        }
      }

      deck.push(entry);
    });

    byCat = {};
    deck.forEach(function (e) {
      (byCat[e.cat] = byCat[e.cat] || []).push(e);
    });

    return deck;
  }

  function all() { return deck; }
  function categories() { return Object.keys(byCat); }
  function countIn(cats) { return pool(cats).length; }
  function clozeCount(cats) {
    return pool(cats).filter(function (e) { return !!e.cloze; }).length;
  }

  function pool(cats) {
    if (!cats || !cats.length) return deck.slice();
    var want = {};
    cats.forEach(function (c) { want[c] = true; });
    return deck.filter(function (e) { return want[e.cat]; });
  }

  /* ---------------------------------------------------------
     Selection weighting

     The exam is close, so the mix leans hard on what is not yet
     known: a word you have missed is worth many times a word you
     have already nailed twice running.
     --------------------------------------------------------- */

  function weightOf(e) {
    var r = Store.get(e.id);
    var w;

    if (r.s === 0)            w = 30;                    // never seen
    else if (r.streak === 0)  w = 100 + Math.min(r.w, 5) * 25;  // missed, and missed often
    else if (r.streak === 1)  w = 45;                    // one right answer proves little
    else if (r.streak === 2)  w = 12;
    else                      w = Math.max(3, 12 - r.streak); // solid: keep it barely alive

    w *= (e.diff === 3 ? 1.45 : e.diff === 2 ? 1.15 : 1);

    // a miss in the last two days stays hot
    if (r.streak === 0 && r.last && (Date.now() - r.last) < 2 * 86400000) w *= 1.35;

    return w;
  }

  function weightedSample(items, n) {
    var bag = items.map(function (e) { return { e: e, w: weightOf(e) }; });
    var out = [];
    var total = bag.reduce(function (s, b) { return s + b.w; }, 0);

    while (out.length < n && bag.length) {
      var r = Math.random() * total, acc = 0, idx = 0;
      for (var i = 0; i < bag.length; i++) {
        acc += bag[i].w;
        if (r <= acc) { idx = i; break; }
        idx = i;
      }
      out.push(bag[idx].e);
      total -= bag[idx].w;
      bag.splice(idx, 1);
    }
    return out;
  }

  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------------------------------------------------------
     Distractors

     Good wrong answers are the whole game. A distractor from the
     same topic that looks or sounds like the target forces an
     actual decision; a random word from another chapter does not.
     --------------------------------------------------------- */

  function sharedPrefix(a, b) {
    var x = fold(a), y = fold(b), i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    return i;
  }

  /* Rough part-of-speech shape. When the options are Italian, a noun sitting
     in a slot that needs a verb is eliminated on sight, so the question stops
     testing vocabulary and starts testing grammar-spotting. Matching the shape
     forces the choice back onto meaning. */
  function morphShape(phrase) {
    var p = fold(phrase).trim();
    if (/^(e|non e|si |ha |e fatto)\b/.test(p)) return 'pred';   // è vietato, si deve, ha l'obbligo di
    var last = p.split(/\s+/).pop();
    if (/(are|ere|ire|arsi|ersi|irsi)$/.test(last)) return 'inf';
    if (/(ato|ito|uto|ata|ita|uta|ati|iti|uti|ate|ite|ute)$/.test(last)) return 'part';
    if (/(mente)$/.test(last)) return 'adv';
    if (/[aeiou]$/.test(last)) return 'noun';
    return 'other';
  }

  function distractors(target, candidates, n, keyFn, italianOptions) {
    var targetKey = fold(keyFn(target));
    var targetShape = italianOptions ? morphShape(target.it) : null;
    var scored = [];

    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c.id === target.id) continue;

      var key = fold(keyFn(c));
      if (key === targetKey) continue;          // synonymous gloss — would be a second right answer
      if (!key) continue;

      var s = Math.random() * 1.6;              // keeps repeat sessions from looking identical
      if (c.cat === target.cat) s += 3.2;
      if (c.diff === target.diff) s += 0.9;
      if (sharedPrefix(c.it, target.it) >= 3) s += 2.4;   // carreggiata / carreggiabile
      if (c.it.split(' ').length === target.it.split(' ').length) s += 0.7;
      if (targetShape && morphShape(c.it) === targetShape) s += 4.5;

      scored.push({ c: c, s: s, key: key });
    }

    scored.sort(function (a, b) { return b.s - a.s; });

    var out = [], used = {};
    used[targetKey] = true;
    for (var j = 0; j < scored.length && out.length < n; j++) {
      if (used[scored[j].key]) continue;        // no two identical-looking options
      used[scored[j].key] = true;
      out.push(scored[j].c);
    }
    return out;
  }

  /* ---------------------------------------------------------
     Question building
     --------------------------------------------------------- */

  function makeQuestion(entry, kind, candidates) {
    var q = { entry: entry, kind: kind };

    if (kind === 'cloze') {
      q.prompt = entry.cloze;
      q.answer = entry.it;
      q.wrong = distractors(entry, candidates.filter(function (c) { return !!c.it; }), 3,
                            function (c) { return c.it; }, true);
      q.optionText = function (c) { return c.it; };
    } else if (kind === 'en-it') {
      q.prompt = entry.en;
      q.answer = entry.it;
      q.wrong = distractors(entry, candidates, 3, function (c) { return c.it; }, true);
      q.optionText = function (c) { return c.it; };
    } else {
      q.prompt = entry.it;
      q.answer = entry.en;
      q.wrong = distractors(entry, candidates, 3, function (c) { return c.enKey; });
      q.optionText = function (c) { return c.en; };
    }

    var opts = q.wrong.map(function (c) {
      return { text: q.optionText(c), correct: false, entry: c };
    });
    opts.push({ text: q.optionText(entry), correct: true, entry: entry });
    q.options = shuffle(opts);
    return q;
  }

  /* opts: { mode, cats, focus, length } */
  function build(opts) {
    var candidates = pool(opts.cats);
    if (candidates.length < 4) candidates = deck.slice();

    var eligible = candidates;
    if (opts.mode === 'cloze') {
      eligible = candidates.filter(function (e) { return !!e.cloze; });
    }

    // focus narrows the pool; if it narrows too far we top back up
    var focused = eligible;
    if (opts.focus === 'weak') {
      focused = eligible.filter(function (e) {
        var r = Store.get(e.id);
        return r.s > 0 && r.streak < 2;
      });
    } else if (opts.focus === 'new') {
      focused = eligible.filter(function (e) { return Store.get(e.id).s === 0; });
    } else if (opts.focus === 'hard') {
      focused = eligible.filter(function (e) { return e.diff === 3; });
    }

    var n = Math.min(opts.length, eligible.length);
    var picked;

    if (focused.length >= n) {
      picked = weightedSample(focused, n);
    } else {
      picked = focused.slice();
      var takenIds = {};
      picked.forEach(function (e) { takenIds[e.id] = true; });
      var rest = eligible.filter(function (e) { return !takenIds[e.id]; });
      picked = picked.concat(weightedSample(rest, n - picked.length));
    }

    picked = shuffle(picked);

    // distractors are drawn from the whole selected topic pool, not
    // just the 30 picked, so wrong answers stay varied
    var distractorPool = opts.mode === 'cloze'
      ? candidates.filter(function (e) { return e.it; })
      : candidates;

    return picked.map(function (e) {
      var kind = opts.mode;
      if (kind === 'mixed') kind = Math.random() < 0.5 ? 'it-en' : 'en-it';
      if (kind === 'cloze' && !e.cloze) kind = 'it-en';
      return makeQuestion(e, kind, distractorPool);
    });
  }

  /* Rebuild a session from a specific set of entries (used by
     "drill what I missed"), same question shapes as a normal run. */
  function buildFrom(entries, opts) {
    var candidates = pool(opts.cats);
    if (candidates.length < 4) candidates = deck.slice();
    return shuffle(entries).map(function (e) {
      var kind = opts.mode;
      if (kind === 'mixed') kind = Math.random() < 0.5 ? 'it-en' : 'en-it';
      if (kind === 'cloze' && !e.cloze) kind = 'it-en';
      return makeQuestion(e, kind, candidates);
    });
  }

  return {
    prepare: prepare,
    all: all,
    pool: pool,
    categories: categories,
    countIn: countIn,
    clozeCount: clozeCount,
    build: build,
    buildFrom: buildFrom,
    slug: slug,
    fold: fold
  };
})();
