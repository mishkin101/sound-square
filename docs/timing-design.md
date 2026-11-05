# Placing things in time: design notes

> Status: built, first pass. Moments (M), layer from/until menus, spot modes
> (all at once / take turns / one at a time) and color pulses are in the studio.
> The opening runs on placeholder timing until the real song is marked.
> Michelle describes moments of the song as she pictures them; each becomes a
> general idea and a piece of interface that handles moments like it.

## What Michelle described

### The opening
- On the first beat, the drum stick tap, an eye appears in the upper left.
- It's one eye. On the two faster beats after it, it switches corners: to the
  upper right, then back to the upper left. It switches where it is with the beat.
- The salmon ground pulses: over four beats it fades to white, starting on the
  stick tap, and it keeps doing this until the bongos come in.
- What happens to the eye when the bongos come in: to be decided.

## General ideas so far

### 1. Moments: things you hear, marked on the song
"The stick tap", "the two fast beats", "the bongos come in". These are named
moments in the real song, not bar numbers. You mark them by tapping a key while
the song plays, and they sit on the timeline as markers you can drag and nudge.
A moment can be one hit, a group of hits (the two fast beats), or the start of a
part (the bongos).

Because they're marked on the real song, they also replace the placeholder
timing: no need to get the bar grid perfect before placing things.

### 2. Everything starts and ends on a moment
A shape, a spot or a color change says *when* in words: "comes in on the stick
tap", "until the bongos come in". It can also be counted from a moment: "4 bars
after the bongos". Bar numbers remain possible but aren't the main way.

### 3. One thing, several places: it moves on the hits
A layer's spots can work three ways:
- **all at once**: every spot shows its own copy (the old four-corner eyes)
- **take turns**: copies appear one by one, a spot per hit, and stay
- **one at a time**: a single copy that moves to the next spot on each hit

The opening eye is *one at a time* with two spots, upper left and upper right,
moving on the stick tap and the two fast beats: upper left, upper right, upper left.
What it moves on is picked like everything else: a moment's hits, every beat,
every bar, the claps, the bongos.

### 4. Repeating color changes between two moments
"Pulse salmon → white over 4 beats, from the stick tap until the bongos." A
color behavior has a shape (pulse, fade, flash), a length in beats, and a start
and end moment.

## Interface sketch

```
timeline
  moments   ▼stick tap ▼▼fast taps                    ▼bongos in
  sections  | opening                                 | bongo line
  eye       L──R─L───────────────────────────────────── (where the eye is)
  ground    ∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿∿ pulse until bongos in

panel, with the eye picked
  comes in   on [ stick tap ▾ ]
  spots      [ one at a time ▾ ]  moves on [ intro hits ▾ ]  [ jump ▾ ]
  leaves     on [ bongos in ▾ ]  [ fade ▾ ]
```

- **M** while playing drops a moment where you are; tapping again quickly adds
  hits to the same moment. Name it afterwards. Drag to move, arrows to nudge.
- Picking a moment in a menu makes the layer's bar on the timeline snap to it.

## Making the opening, step by step
1. **Mark what you hear** (on the timeline): play the song, press M on the stick
   tap, M twice on the fast beats (quick presses make one moment with two hits),
   M when the bongos come in. Name the three moments.
2. **Place the eye** (the eye layer): two spots on the square, upper left then
   upper right. Comes in on *stick tap*, *one at a time*, moves on *stick tap +
   fast taps*, leaves on *bongos in*.
3. **Pulse the ground** (the colors): salmon → white over 4 beats, from *stick
   tap* until *bongos in*.

A clickable mockup of this was shown in the conversation; its menus for "then",
"switches by" and the pulse's way back are the open questions below.

## Decided since
- The eye is one copy with two spots; the right spot is mirrored (spots can be
  mirrored with X and turned with R in edit mode, and copied with D).
- It keeps switching corners every beat for the first 4 bars, then stays put
  (`thenEvery: "beat"`, `moveBars: 4`).
- The timeline is the editor: layers are clips, dragged and trimmed in place,
  with ends that snap to bars and attach to moments. The side panel shows a
  compact layer list and only the picked layer's controls. It zooms (pinch or
  ⌘-scroll), pans (scroll) and follows the playhead.

### Layers hold shapes (option 1)
A layer is a named row on the timeline holding shape clips; each clip keeps its
own from/until, spots and behavior. Rows give z-order (drag to restack), rename
(double-click), hide (the eye) and bulk delete. Moments carry notes and can stay
off the timeline (per-moment eye, or hide all) while still anchoring and
triggering — the panel is the record, the ruler only shows pinned anchors.

## Keyframes: built
Rules (moments, moves on, pulses) stay the backbone because they re-sync when
the song is re-marked and react to claps/bongos/energy. Keyframes are the
general tool for placement over time: a clip gets
`keys: [{ at, x, y, size, deg, fade }]` where `at` is `"bar:beat"` or a
moment's name, eased (smoothstep) between keys and held flat outside them.
`fade` scales the clip's visibility on top of its in/out.

Authoring: scrub to a time, drag the spot where the shape should be (E), press
K (or + Key in the toolbar) — the spot's place becomes a key at the playhead; a
key within a tenth of a beat is updated instead. Landing on a moment's hit
stores the moment's name, so the key re-syncs with it. The picked clip shows
its keys as diamonds on its timeline row: drag one to move it (it attaches to a
moment within reach, else the nearest quarter beat); the panel lists them with
→ to jump there and × to remove. While a clip has keys they drive its place and
the spot modes step aside; delete all keys and the modes come back. The spots
stay as drag handles for authoring ("one at a time" etc. remain the shortcut
for hit-driven switching).

## Open questions
- After the three intro hits, does the eye keep switching corners with the beat
  (every beat? every bar?) until the bongos, or stay put?
- How does it switch: jump instantly, blink shut and open in the new corner, or
  slide across?
- The pulse: salmon → white, then a snap back to salmon (breathing out), or a
  fade back to salmon (breathing in and out)?
- When the bongos come in, what happens to the eye: tbd.
