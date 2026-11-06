# Working rules for this project

- NEVER add user-facing text Michelle didn't write herself: no `note:` fields
  on moments, no placeholder notes, descriptions, or sample content in the
  score. Her score data is hers; Claude's explanations belong in chat or in
  code comments, never in anything the studio displays.
- score.js is the baked source of truth, but the browser's saved work
  (localStorage "soundsquare.work") overrides it on load. After changing
  score.js, remind her to press "Reset to score.js" — a plain reload is
  enough only for pure UI/code changes.
- Bump the `?v=` cache-buster in index.html on every asset change.
- Verify every change live in the browser preview before reporting it.
- Commit and push after each feature, as
  `-c user.name="Michelle" -c user.email="57876448+mishkin101@users.noreply.github.com"`.
- UI wording must be direct and technical (e.g. "quantize", "trigger",
  "intensity", "decay (beats)") — no cute or vague phrasing.
- NEVER long text in the UI: no explaining sentences in status lines or
  hints. Prefer a mini button or action; any explanation goes in its hover
  title. Status messages stay a few words.
- Hover titles say the action only (e.g. "⇧W: record the waveform while the
  song plays") — no reasons, no background, no "because".
