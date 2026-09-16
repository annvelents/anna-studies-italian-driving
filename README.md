# Patente Vocab

A vocabulary trainer for the **Italian driving theory exam** (*esame di teoria, patente B*),
built for a learner who knows how to drive but is still learning Italian.

**→ https://annvelents.github.io/anna-study-italian-driving/**

Plain HTML, CSS and JavaScript. No build step, no dependencies, no backend — the whole
deck ships as a JavaScript array and everything runs in the browser.

## Why this exists

The exam is 30 true/false statements in 20 minutes, and you may get at most 3 wrong.
For a non-native speaker the road rules are rarely the hard part. The hard part is that
a single word decides the answer:

- *è consentito* (may) vs *è obbligatorio* (must)
- *preannuncia* (warns of something ahead) vs *vieta* (forbids here)
- *in prossimità di* (near) vs *in corrispondenza di* (exactly at)
- *almeno* (at least) vs *al massimo* (at most)
- *fermata* (brief halt) vs *sosta* (parking) vs *arresto* (forced stop)

So the deck is weighted toward exactly those, not toward generic travel Italian.

## What's in the deck

416 entries, deduplicated, each with an English gloss, a difficulty rating, an
example sentence in the register of the exam, and — where there is a genuine trap —
a note explaining it.

| Topic | Entries | |
|---|---:|---|
| `linguaggio` | 117 | The sentence machinery: modals, connectives, quantity bounds, negation scope |
| `segnaletica` | 109 | Signs, road markings, road and junction anatomy |
| `comportamento` | 72 | Conduct, precedence, speed, overtaking, stopping, lights, distances |
| `documenti` | 42 | Documents, insurance, penalties, weights and loads |
| `veicolo` | 41 | Vehicle parts, brakes, tyres, mechanics |
| `sicurezza` | 35 | First aid, safety equipment, emissions and environment |

Difficulty: 91 rated beginner, 190 intermediate, 135 hard.

The vocabulary was gathered by analysing the wording of the ministerial question bank
rather than from general word lists — including a frequency pass over an open dataset of
7,139 official patente A/B items, plus the published per-topic question collections and
the relevant articles of the Codice della Strada.

## Session types

- **Italian → English** — the direction the exam demands.
- **English → Italian** — harder; forces recall rather than recognition.
- **Mixed** — both directions shuffled.
- **Fill the gap** — a real-style exam sentence with one word removed, choose from four.
  387 of the 416 entries support this; the rest fall back to translation.

Each session is 30 questions by default, to match the exam, and reports whether you
came in under the 3-mistake limit. Length is adjustable (10/20/30/50).

**Focus** controls what gets drawn: *Smart mix* (weighted toward missed, unseen and
hard words), *My weak words*, *Only new*, or *Hardest only*. Topics can be filtered
independently.

## How it decides what to ask

A word counts as **solid** only after two correct answers in a row — one right answer
out of four options proves very little. Selection is weighted sampling: a word you have
missed is worth roughly eight times an unseen word and thirty times a solid one, scaled
by difficulty, with a recency boost for anything missed in the last two days.

Distractors are the part that makes or breaks a vocabulary quiz. They are drawn from the
same topic, preferring the same difficulty, words sharing a prefix with the target
(*carreggiata* / *carreggiabile*), and — when the options are Italian — the same
morphological shape, so you cannot eliminate an option just because it is a noun sitting
in a verb-shaped gap. Options whose English gloss matches the answer's are excluded
outright, since they would be a second correct answer.

## Progress

Stored in `localStorage`, in your browser, on that device. Nothing is sent anywhere —
there is no server. Clearing site data resets it, and every read is guarded so the app
still works in a private window. "Reset my progress" in the footer clears it deliberately.

## Files

```
index.html        three screens: setup, quiz, results
css/style.css     design tokens, light and dark
js/data.js        the 416-entry deck
js/storage.js     per-word progress, streaks, session history
js/quiz.js        deck prep, weighted selection, distractors, gap-filling
js/app.js         screens, session runtime, DOM
```

## Running it locally

No tooling required:

```sh
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## Adding or fixing a word

Edit `js/data.js`. One object per entry:

```js
{"it":"carreggiata","en":"carriageway (part of road used by vehicles)",
 "cat":"segnaletica","diff":2,
 "note":"Not 'corsia' (a single lane) and not 'banchina', which lies outside it.",
 "ex":"La carreggiata è la parte della strada destinata allo scorrimento dei veicoli."}
```

`note` may be empty. `ex` should contain the headword itself — the gap-fill mode finds
it there and blanks it out, matching across articles and plural forms, so
`cintura di sicurezza` is still found in a sentence that says *le cinture di sicurezza*.
If it cannot be found, the entry simply sits out of gap-fill mode.
