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
  // Color pulses: a palette slot breathing toward a color between two moments.
  colorMoves: [],
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
    { name: "Bongo drums", hits: [28.11] },
    {
      name: "bongo drum start",
      hits: [12.38, 12.92, 13.49, 14.04, 15.21, 15.76, 16.32, 16.88, 17.43, 17.98],
    },
  ],
  // Layers are named rows on the timeline, drawn bottom to top; each holds shape clips.
  // A clip: el is a coded shape from assets/elements.js; shape is a drawing,
  // shapes/<name>.svg, drawn at each of its spots. On from `from` through `to`:
  // a bar number, or a moment's name to land right on it. in / out: "cut",
  // "fade" or "clap". spotsMode: all (every spot), turns (one per hit of moveOn),
  // one (a single copy moves between spots, switching by jump, blink or slide;
  // moveBars caps the moving). A spot is [x, y, size]; add -1 to mirror it there,
  // then degrees to turn it, then degrees to skew it (a parallelogram lean,
  // + leans the top right, top and bottom kept level). hidden: true keeps a
  // whole layer off the square.
  // keys: [{ at, x, y, size, deg, fade, flip }] ease the clip's place over time
  // (K in the studio); at is "bar:beat" or a moment's name; flip: -1 mirrors
  // from that key on; ease: "line" keeps the approach linear. Keys replace the
  // spot modes. keysFrom names the moment whose drawn path made them: editing
  // that path in the studio re-samples the keys. fx: [{ kind, amount, rate,
  // from, to }] are effects on the shape (spin, breathe, wobble), each running
  // in its own window or the clip's whole life — or with keys of its own:
  // keys: [{ at, amount }], the amount eased over time (0 is off), replacing
  // from/to as the envelope. sizeFrom: "wave" scales each appearing spot by
  // the song's loudness at its hit (needs a kept waveform).
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
          fx: [{ kind: "pulse", on: "Pulse", to: "#ffffff", amount: 0.9, beats: 3 }],
        },
        { shape: "line", from: 10, to: 13, in: "fade", out: "fade", spots: [[0.5, 0.5, 0.15]] },
      ],
    },
    {
      // Two rows of eight parallelograms, leaning opposite ways (skew 30 and
      // -30: flat tops and bottoms, sides at 30 degrees). One lands on every
      // beat from "bongo drum start": the top row rightward, then the bottom
      // row back leftward. One spacing unit throughout: the gap between
      // neighbors (measured square to their sides) equals the gap between rows.
      name: "bongos",
      clips: [
        {
          shape: "line",
          from: "bongo drum start",
          to: 40,
          spotsMode: "turns",
          moveOn: "beat",
          spots: [
            [0.1779, 0.4049, 0.1023, 1, 0, 30], [0.2699, 0.4049, 0.1023, 1, 0, 30], [0.362, 0.4049, 0.1023, 1, 0, 30], [0.454, 0.4049, 0.1023, 1, 0, 30], [0.546, 0.4049, 0.1023, 1, 0, 30], [0.638, 0.4049, 0.1023, 1, 0, 30], [0.7301, 0.4049, 0.1023, 1, 0, 30], [0.8221, 0.4049, 0.1023, 1, 0, 30],
            [0.8221, 0.5951, 0.1023, 1, 0, -30], [0.7301, 0.5951, 0.1023, 1, 0, -30], [0.638, 0.5951, 0.1023, 1, 0, -30], [0.546, 0.5951, 0.1023, 1, 0, -30], [0.454, 0.5951, 0.1023, 1, 0, -30], [0.362, 0.5951, 0.1023, 1, 0, -30], [0.2699, 0.5951, 0.1023, 1, 0, -30], [0.1779, 0.5951, 0.1023, 1, 0, -30],
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
