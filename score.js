// sound-square score: what the square does, bar by bar.
// Bar 1 is the first downbeat. Inside a bar, beats count from 0 (the downbeat) to 3.
// Edit by hand, or tune with the studio's sliders and use "Copy score.js".

const SCORE = {
  // The song. The Spotify id gets filled in when we connect Spotify.
  song: {
    title: "I Haven't Recovered From Last Night With You",
    artist: "Divorce from New York",
    spotifyId: "",
  },
  // Timing grid: a placeholder until we tap along to the real song.
  bpm: 120,
  beatsPerBar: 4,
  firstDownbeatMs: 0,
  bars: 48,
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
  // Color pulses: a palette slot breathing toward a color between two moments.
  colorMoves: [
    { slot: "ground", to: "#ffffff", beats: 4, back: "snap", from: "stick tap", until: "bongos in" },
  ],
  // Names for the timeline. Number keys 1-6 jump to them.
  sections: [
    { name: "eyes", from: 1 },
    { name: "bongo line", from: 9 },
    { name: "bongos rise", from: 17 },
    { name: "triangles", from: 25 },
    { name: "split", from: 33 },
    { name: "fringes", from: 41 },
  ],
  // Things you hear, marked on the song (M in the studio while it plays).
  // Layers come in and leave on them, spots move on their hits, pulses run
  // between them. These sit on the placeholder grid until they're re-marked.
  moments: [
    { name: "stick tap", hits: [0] },
    { name: "fast taps", hits: [1, 1.5], note: "two quick taps right after the first", hide: true },
    { name: "bongos in", hits: [32] },
  ],
  // Layers are named rows on the timeline, drawn bottom to top; each holds shape
  // clips. A clip is one thing on the square: el is a coded shape from
  // assets/elements.js; shape is a drawing, shapes/<name>.svg, drawn at each of
  // its spots ([x, y, size]), made in the Shapes tab. On from `from` through
  // `to`: a bar number, or a moment's name to land right on it. in / out:
  // "cut", "fade" or "clap". spotsMode: "all" (every spot at once), "turns"
  // (they appear one per hit of `moveOn`), "one" (a single copy moves between
  // spots on each hit, switching by "jump", "blink" or "slide"; `thenEvery`
  // keeps it moving after the hits, `moveBars` ends the moving). A spot is
  // [x, y, size]; add -1 to mirror the drawing there, then degrees to turn it.
  // `hidden: true` on a layer keeps the whole row off the square.
  layers: [
    { name: "ground", clips: [{ el: "ground", from: 1, to: 48 }] },
    {
      name: "eyes",
      clips: [
        {
          shape: "eye", from: "stick tap", to: "bongos in", out: "fade", outBeats: 2,
          spotsMode: "one", moveOn: "fast taps", thenEvery: "beat", moveBars: 4, switchBy: "jump",
          spots: [[0.11, 0.11, 0.055], [0.89, 0.11, 0.055, -1]],
        },
      ],
    },
    { name: "bongo line", clips: [{ el: "bongoLine", from: 9, to: 24, in: "fade", out: "fade" }] },
    {
      name: "triangles",
      clips: [
        { el: "triangles", from: 25, to: 32, in: "fade", out: "clap" },
        { el: "bongoBoxes", from: 25, to: 40, in: "fade", out: "fade" },
      ],
    },
    {
      name: "split",
      clips: [
        { el: "divider", from: 33, to: 40, in: "clap", out: "fade" },
        { el: "clapBongos", from: 33, to: 40, in: "clap", out: "fade" },
        { el: "dreamTones", from: 33, to: 42, in: "clap", out: "fade", outBeats: 8 },
      ],
    },
    {
      name: "fringes",
      clips: [
        { el: "fringes", from: 41, to: 48, in: "fade", inBeats: 4 },
        { el: "hangers", from: 41, to: 48, in: "fade" },
      ],
    },
  ],
};
