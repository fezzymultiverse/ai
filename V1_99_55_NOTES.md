# Horizon V1.99.55 - CHAT BOX SPACING + MESSAGE ALIGNMENT

Includes everything in V1.99.54. Nothing removed.
Changed: www/horizon_app.css (new block at the very end), www/index.html (css cache-bust ?v=1.99.55), www/horizon_about.js (version + changelog),
tests/front-header.test.cjs (cache-bust number), tests/chatbox-v55.test.cjs (new, 7 checks).

## What was wrong (from the group chat screenshot)
1. Chat box text on the top edge. Group and people chats add the class hz-has-options to the box. Since V1.99.39 that class forces the box's top padding to 0
   (the Options pill moved above the box), and the textarea itself only had 2px of top padding. Result: placeholder, cursor and typed text on the border.
2. Message text touching the colour rail. AI bubbles have padding 2px 0, and group chats add a 3px colour rail (border-left) to that bubble, so the text sat 0px from the rail.
   The message itself also carried a second 2px rail from the chat-finish styling, so group replies had two rails side by side.
3. Message list gutter was 16px while the chat box gutter was 12px, so the two never lined up.

## What changed (all in the last block of horizon_app.css)
- Chat box: 12px above the text, 14px each side, 10px below, with or without the Options pill. Text box padding 8/6/6/8, line height 1.45, min height 46px.
- Group colour rail: text is 12px off the rail; the duplicate message-level rail is removed in group chats only (the per-AI colour rail stays).
- One shared side gutter (12px) for the message list and the chat box.
- Tune it from four numbers at the top of the block: --hz-gut, --hz-in-top, --hz-in-side, --hz-rail-gap.

## Tested
node --check on every www/*.js, inline-script check, all tests (old + 7 new in tests/chatbox-v55.test.cjs): block is last in the file, padding wins over the old zero-padding rule,
rail padding, shared gutter, cache-bust, version, balanced braces.

## NOT verified (needs the phone)
No browser was available here, so the result was NOT rendered. The checks are on the CSS rules and the cascade order, not on pixels. Check on the phone:
group chat box text spacing, the colour rail spacing, and a normal (non-group) chat. If anything is too tight or too loose, change the four numbers above.
The two floating round buttons on the right of the chat area (scroll-down and +) were left alone; they can still sit on top of message text.

## Known flaky test (not caused by this change)
tests/people-hub.test.cjs "v1.99.7: @tag makes a guest for one reply" waits 3.4 s on a timer and occasionally fails when predeliver runs all test files in parallel. It passes alone and on the next run.

## JSON / config
package.json and capacitor.config.json are NOT in this zip (they never were in V1.99.54) and this change does not need them. I did not add guessed copies, because unzipping a guessed
file over your real one would break the CI build. Keep those two files in your GitHub repo.
