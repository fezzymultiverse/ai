# V1.99.99 - Grounding: the AI checks facts before it answers

Changed: NEW www/horizon_ground.js, www/index.html (script tag, tool round, result labelling, tag stripping), horizon_toolpolicy.js (block added to the tool contract), horizon_release.js, horizon_about.js, horizon_model_inventory.js, package.json files, NEW tests/ground-v99.test.cjs, version asserts in chatbox-v55 and front-header tests.

1. Wikipedia was only a bookmark in your browser module. It is now an AI tool, wired in the same way as Maps, Lyrics and Dash: tags the model writes, the app runs, the result goes back to the model.
2. Tags (max 3 per turn, same as every other tool):
   - Wikipedia: [[wiki.search: words | lang]], [[wiki.get: exact title | lang]] (summary + URL + Wikidata id), [[wiki.more: exact title | lang]] (longer text). lang is optional, default en.
   - Wikidata: [[wikidata.find: name]], [[wikidata.facts: Q-id or name]] (born, died, occupation, country, population as of year, founded, author, genre, performer, dates and more).
   - Open Library: [[books.search: title | author]], [[books.isbn: isbn]], [[books.author: name]].
   - MusicBrainz: [[mb.artist: name]] (type, country, years, studio albums by first-release date), [[mb.recording: song | artist]] (first release date, length), [[mb.release: album | artist]] (release date + track list).
3. Honest failure: a failed or empty lookup returns ERROR or NOT FOUND with an instruction to say "I could not verify this" and not to fill the gap from memory. Disambiguation pages list candidates. A fuzzy Wikipedia title falls back to the closest search hit and says so.
4. Safety: only en/xx.wikipedia.org, www.wikidata.org, openlibrary.org and musicbrainz.org over https are ever contacted. Returned text is cleaned (no [[ ]] tags, no control characters, length-capped) and labelled UNTRUSTED DATA in the prompt, like web results.
5. MusicBrainz is limited to one request a second: its calls are queued 1.1 s apart, so mb.artist takes about 3 s. Results are cached 10 minutes.
6. Small-model (lite) prompt gets a 1-paragraph version of the block; full prompt gets the full rules (when to use it, when not to, how to cite).
7. Kill switch: localStorage horizon_ground_on = '0'. No UI toggle yet.
8. NO APK REBUILD NEEDED: the lookups use the native HTTP the app already uses (CapacitorHttp, on in capacitor.config) and plain fetch in a browser preview.
9. Tests: tests/ground-v99.test.cjs, 11 tests, mocked network. Full suite: 248 pass, 3 fail. The same 3 fail on the untouched V1.99.98 zip (stats restore byte-identical, native check-in router aliases, OpenRouter seed). Not touched.
10. NOT run against the live sites: the build sandbox cannot reach them. The response shapes are coded from the public API docs and are tested with fixtures. First live check on the phone: ask "when did Muse release Origin of Symmetry" and watch the thinking line for "Fact lookup done".
