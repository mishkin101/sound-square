// sound-square score: what the square does, bar by bar.
// Bar 1 is the first downbeat. Inside a bar, beats count from 0 (the downbeat) to 3.
// Edit by hand, or tune with the studio's sliders and use "Copy score.js".

const SCORE = {
  // The song. The Spotify id gets filled in when we connect Spotify.
  song: {
    title: "I Haven't Recovered From Last Night With You",
    artist: "Divorce from New York",
    spotifyId: "0KJKIGebZqDyMoxI2NMpL0",
  },
  // Timing grid: a placeholder until we tap along to the real song.
  bpm: 126,
  beatsPerBar: 4,
  firstDownbeatMs: 1615,
  bars: 216,
  // Energy from 0 to 1 at chosen bars; bars in between blend smoothly.
  energy: [[1, 0.2], [9, 0.4], [17, 0.65], [25, 0.7], [33, 0.85], [41, 0.55], [48, 0.3]],
  // What happens in the music. A pattern lists beats inside one bar and repeats
  // for every bar in `bars`. Holds are [bar, beat, length in beats].
  tracks: {
    claps: { bars: [9, 40], pattern: [1, 3] },
    bongos: { bars: [9, 40], pattern: [0.5, 0.75, 1.5, 2.25, 2.5, 3.5, 3.75] },
    keys: { holds: [[41, 0, 6], [42, 3, 2], [43, 2, 7], [45, 2, 3], [46, 2, 6], [48, 0, 3]] },
  },
  // Palettes share the same slots, so any two can blend.
  palettes: {
    salmon: {
      ground: "#f3a08b",
      glow: "#f8bfae",
      line: "#2e8b82",
      ink: "#1c5954",
      light: "#fff3ea",
      dreamy: ["#ff8fc4", "#b99cff", "#7fd3ff", "#ffe370", "#8ff0c2"],
    },
    dream: {
      ground: "#f19bab",
      glow: "#f6c3d3",
      line: "#2a8a8c",
      ink: "#1a4f5d",
      light: "#fff2f6",
      dreamy: ["#ffa3d6", "#a99aff", "#86dcff", "#fff08a", "#a0f4d2"],
    },
    deep: {
      ground: "#ec8c77",
      glow: "#f3a993",
      line: "#23756e",
      ink: "#164a46",
      light: "#ffeee4",
      dreamy: ["#ff7fb3", "#a58cff", "#6cc8f4", "#ffd65e", "#80e5b3"],
    },
  },
  // Which palette starts at which bar. Changes blend over colorFadeBars.
  colors: [[1, "salmon"], [33, "dream"], [41, "deep"]],
  colorFadeBars: 2,
  // Names for the timeline. Number keys 1-6 jump to them.
  sections: [],
  // Things you hear, marked on the song (M in the studio while it plays; held
  // down, M marks a hold: [start, end] in beats, a span like the bongo section).
  // Layers come in and leave on them, spots move on their hits, pulses run between them.
  // Each can carry a note; hide: true keeps its marker off the timeline.
  moments: [
    {
      name: "eye panning",
      hits: [4.15, 5.06, 5.78, 6.88, 7.32, 8.38, 9.11, 9.83, 10.9, 11.35],
      repeat: { every: 8, times: 3 },
    },
    { name: "Pulse", hits: [0.05], repeat: { every: 4, times: 610 } },
    {
      name: "Bongo drums",
      hits: [28.11, 29.25, 29.4, 29.82, 30.92, 31.2, 31.5, 32.06, 33.19, 33.76, 33.88, 34.31, 34.85],
      repeat: { every: 8, times: 1 },
    },
    {
      name: "bongo drum start",
      hits: [12.38, 12.92, 13.49, 14.04, 15.21, 15.76, 16.32, 16.88, 17.43, 17.98],
    },
    { name: "triangle tick", hits: [36.03] },
    { name: "heavy kick", hits: [43.89] },
    { name: "line and circle", hits: [56.04] },
  ],
  // Layers are named rows on the timeline, drawn bottom to top; each holds shape clips.
  // A clip: el is a coded shape from assets/elements.js; shape is a drawing,
  // shapes/<name>.svg, drawn at each of its spots. On from `from` through `to`:
  // a bar number, or a moment's name to land right on it. in / out: "cut",
  // "fade" or "clap". spotsMode: all (every spot), turns (one per hit of moveOn;
  // moveOn as a number steps every that many beats),
  // one (a single copy moves between spots, switching by jump, blink or slide;
  // moveBars caps the moving). A spot is [x, y, size]; add -1 to mirror it there,
  // then degrees to turn it, then degrees to skew it (a parallelogram lean,
  // + leans the top right, top and bottom kept level). crop: [left, top,
  // right, bottom] (0-1) draws the clip only inside that rectangle. hidden:
  // true keeps a whole layer off the square.
  // keys: [{ at, x, y, size, deg, fade, flip }] ease the clip's place over time
  // (K in the studio); at is "bar:beat" or a moment's name; flip: -1 mirrors
  // from that key on; ease: "line" keeps the approach linear. Keys replace the
  // spot modes. keysFrom names the moment whose drawn path made them: editing
  // that path in the studio re-samples the keys. fx: [{ kind, amount, rate,
  // from, to }] are effects on the shape (spin, breathe, wobble), each running
  // in its own window or the clip's whole life — or with keys of its own:
  // keys: [{ at, amount }], the amount eased over time (0 is off), replacing
  // from/to as the envelope. A fill effect shows the spots one at a time in
  // list order: { kind: "fill", on: a moment (a spot per hit), or every: the
  // grid step in beats; loop: true starts over once all have shown; fade:
  // beats each spot takes to fade in — a lone spot fades in from the clip's
  // start }. A pulse effect on a shape flares a
  // palette slot, or with slot: "shape" the shape itself: mode "flash" shows
  // it only on each hit (its own look, fading out over `beats`), "tint" keeps
  // it showing and washes it toward the pulse color on each hit. A pulse runs
  // between from and until (a bar, included, or a moment); outside, nothing.
  // A clip can wear several, in separate windows. A ripple effect sends a
  // ring out from the shape's rim on each hit: { kind: "ripple", on: a
  // moment, or every: the grid step in beats, color: a
  // palette slot or a hex, distance: how far it travels,
  // width: its thickness (both in square units), beats: how long it lives,
  // amount: its opacity }, between from and until. A scatter effect lands
  // the spots somewhere new on each hit: { kind: "scatter", on: a moment, or
  // every: the grid step in beats, area: [left, top, right, bottom] (0–1 of
  // the square) they stay inside, apart: true places each spot on its own
  // (else they move together, keeping their layout) } — random, but the
  // same every playback.
  // A follow effect sets a property
  // from the song: { kind: "follow", source: "pitch" | "loudness", target:
  // "height" | "size", mapping: "relative" (lowest hit to min, highest to max)
  // | "absolute", min, max: scales, before, after: the beats read around each
  // hit, anchor: "inner" | "center" | "top" | "bottom" (the edge a height
  // change keeps) }. Pitch comes from waveform recordings. An oscillate
  // effect moves the spots back and forth: { kind: "oscillate", axis: "x" |
  // "y", direction: "mirror" (each away from the middle) | "together",
  // amount: the distance, rate: beats per cycle } — out on the grid, back to
  // rest halfway. A paint effect fills the shape with its own color: { kind:
  // "paint", style: "solid" | "gradient", color: a palette slot or a hex,
  // spread: the gradient's hue range in degrees, drift: turns per bar, spots:
  // which spots it covers, numbered from 1 (all when left out) }.
  layers: [
    {
      name: "background",
      locked: true,
      clips: [
        {
          shape: "background",
          from: 1,
          to: 216,
          spots: [[0.5, 0.5, 0.5]],
          fx: [{ kind: "pulse", on: "Pulse", to: "#ffffff", amount: 0.9, beats: 3, until: 10 }],
        },
      ],
    },
    {
      // Pattern 1, kept in reserve (hidden, on plain bars): two rows of eight
      // parallelograms leaning opposite ways (skew 30 and -30: flat tops and
      // bottoms, sides at 30 degrees), the top row filling rightward, then the
      // bottom row back leftward. One spacing unit throughout: the gap between
      // neighbors (measured square to their sides) equals the gap between rows.
      name: "bongos",
      hidden: true,
      clips: [
        {
          shape: "line",
          from: 4,
          to: 7,
          spots: [
            [0.1779, 0.4049, 0.1023, 1, 0, 30], [0.2699, 0.4049, 0.1023, 1, 0, 30], [0.362, 0.4049, 0.1023, 1, 0, 30], [0.454, 0.4049, 0.1023, 1, 0, 30], [0.546, 0.4049, 0.1023, 1, 0, 30], [0.638, 0.4049, 0.1023, 1, 0, 30], [0.7301, 0.4049, 0.1023, 1, 0, 30], [0.8221, 0.4049, 0.1023, 1, 0, 30],
            [0.8221, 0.5951, 0.1023, 1, 0, -30], [0.7301, 0.5951, 0.1023, 1, 0, -30], [0.638, 0.5951, 0.1023, 1, 0, -30], [0.546, 0.5951, 0.1023, 1, 0, -30], [0.454, 0.5951, 0.1023, 1, 0, -30], [0.362, 0.5951, 0.1023, 1, 0, -30], [0.2699, 0.5951, 0.1023, 1, 0, -30], [0.1779, 0.5951, 0.1023, 1, 0, -30],
          ],
          fx: [
            { kind: "fill", every: 0.25, loop: true },
            { kind: "follow", source: "pitch", target: "height", mapping: "relative", min: 0.45, max: 1, before: 0.1, after: 0.4, anchor: "inner" },
          ],
        },
      ],
    },
    {
      // A band of 45-degree stripes from "bongo drum start" until the "Bongo
      // drums" moment, thickness equal to the gap, cut straight at the band's
      // left and right sides by the crop. Each stripe's length follows the
      // pitch at its hit, stretching from its middle, so the band staggers
      // around its center line.
      name: "stripes",
      clips: [
        {
          shape: "stripe",
          from: "bongo drum start",
          to: "Bongo drums",
          crop: [0.1, 0, 0.9, 1],
          spots: [
            [-0.0515, 0.5, 0.278, 1, 45], [0.022, 0.5, 0.278, 1, 45], [0.0955, 0.5, 0.278, 1, 45], [0.1691, 0.5, 0.278, 1, 45], [0.2426, 0.5, 0.278, 1, 45], [0.3162, 0.5, 0.278, 1, 45], [0.3897, 0.5, 0.278, 1, 45], [0.4632, 0.5, 0.278, 1, 45],
            [0.5368, 0.5, 0.278, 1, 45], [0.6103, 0.5, 0.278, 1, 45], [0.6838, 0.5, 0.278, 1, 45], [0.7574, 0.5, 0.278, 1, 45], [0.8309, 0.5, 0.278, 1, 45], [0.9045, 0.5, 0.278, 1, 45], [0.978, 0.5, 0.278, 1, 45], [1.0515, 0.5, 0.278, 1, 45],
          ],
          fx: [
            { kind: "fill", every: 0.25, loop: true },
            { kind: "follow", source: "pitch", target: "height", mapping: "relative", min: 0.3, max: 1, before: 0.1, after: 0.4, anchor: "center" },
          ],
        },
      ],
    },
    {
      // A bar of four squares across the bottom of the square. On every hit of
      // "Bongo drums" (its tapped sequence, played twice) one of the four,
      // picked at random and never the same twice running, flashes and fades
      // — black at the corners, the gradient in the middle. From bar 11 the
      // whole square is the chromatic gradient, cut in at once; at the heavy
      // kick the "heavy kick" layer takes over the black squares.
      name: "squares",
      clips: [
        {
          shape: "square",
          from: 11,
          to: 16,
          spots: [[0.5, 0.5, 0.5]],
          fx: [{ kind: "paint", style: "gradient", color: "ground", spread: 20, drift: 1.1 }],
        },
        {
          shape: "square",
          from: "Bongo drums",
          to: "heavy kick",
          spots: [[0.875, 0.875, 0.125], [0.125, 0.875, 0.125], [0.375, 0.875, 0.125], [0.625, 0.875, 0.125]],
          fx: [
            { kind: "hop", on: "Bongo drums", order: "random" },
            { kind: "pulse", on: "Bongo drums", slot: "shape", mode: "flash", amount: 1, beats: 0.5 },
            { kind: "paint", style: "solid", color: "#000000", spots: [1, 2] },
            { kind: "paint", style: "gradient", color: "ground", spread: 20, drift: 1.25, spots: [3, 4] },
          ],
        },
      ],
    },
    {
      // From the heavy kick, the black squares in their own layer: they stay
      // and pulse by size, swelling on every beat from bar 12 and settling
      // (breathe), with a very quick ripple off their rim on the same grid
      // step, so each swell throws one.
      name: "heavy kick",
      clips: [
        {
          shape: "square",
          from: "heavy kick",
          to: 16,
          spots: [[0.875, 0.875, 0.125], [0.125, 0.875, 0.125]],
          fx: [
            { kind: "paint", style: "solid", color: "#000000" },
            { kind: "breathe", amount: 1, rate: 1, from: 12 },
            { kind: "ripple", every: 1, from: 12, color: "#000000", distance: 0.04, width: 0.02, beats: 0.5, amount: 1 },
          ],
        },
      ],
    },
    {
      // From the triangle tick until the line and circle: three outline
      // triangles, stepped up to the right in dreamy 1, 3 and 4, landing
      // somewhere new in the left middle half of the square on every beat.
      name: "triangles",
      clips: [
        {
          shape: "triangle",
          from: "triangle tick",
          to: "line and circle",
          spots: [[0.1784, 0.5335, 0.08], [0.25, 0.5, 0.08], [0.3216, 0.4665, 0.08]],
          fx: [
            { kind: "scatter", every: 1, area: [0, 0.25, 0.5, 0.75] },
            { kind: "paint", style: "solid", color: "dreamy1", spots: [1] },
            { kind: "paint", style: "solid", color: "dreamy3", spots: [2] },
            { kind: "paint", style: "solid", color: "dreamy4", spots: [3] },
          ],
        },
      ],
    },
    {
      name: "eyes",
      clips: [
        {
          shape: "eye",
          from: 1,
          to: 8,
          out: "fade",
          outBeats: 2,
          spots: [[0.1295, 0.167, 0.0874], [0.8733, 0.1698, 0.085, -1]],
          fx: [{ kind: "hop", on: "eye panning" }],
        },
      ],
    },
  ],
};
