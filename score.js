// sound-square score: what the square does, bar by bar.
// Bar 1 is the first downbeat. Inside a bar, beats count from 0 (the downbeat) to 7.
// Edit by hand, or tune with the studio's sliders and use "Copy score.js".

const SCORE = {
  // The song. The Spotify id gets filled in when we connect Spotify.
  song: {
    title: "I Haven't Recovered From Last Night With You",
    artist: "Divorce from New York",
    spotifyId: "0KJKIGebZqDyMoxI2NMpL0",
  },
  // Timing grid: a placeholder until we tap along to the real song.
  bpm: 252,
  beatsPerBar: 8,
  firstDownbeatMs: 1615,
  bars: 216,
  // Energy from 0 to 1 at chosen bars; bars in between blend smoothly.
  energy: [[1, 0.2], [9, 0.4], [17, 0.65], [25, 0.7], [33, 0.85], [41, 0.55], [48, 0.3]],
  // What happens in the music. A pattern lists beats inside one bar and repeats
  // for every bar in `bars`. Holds are [bar, beat, length in beats].
  tracks: {
    claps: { bars: [9, 40], pattern: [2, 6] },
    bongos: { bars: [9, 40], pattern: [1, 1.5, 3, 4.5, 5, 7, 7.5] },
    keys: { holds: [[41, 0, 12], [42, 6, 4], [43, 4, 14], [45, 4, 6], [46, 4, 12], [48, 0, 6]] },
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
      hits: [8.3, 10.12, 11.56, 13.76, 14.64, 16.76, 18.22, 19.66, 21.8, 22.7],
      repeat: { every: 16, times: 3 },
    },
    { name: "Pulse", hits: [0.1], repeat: { every: 8, times: 610 } },
    { name: "Bongo drums", hits: [56.22] },
    {
      name: "bongo drum start",
      hits: [24.76, 25.84, 26.98, 28.08, 30.42, 31.52, 32.64, 33.76, 34.86, 35.96],
    },
  ],
  // Layers are named rows on the timeline, drawn bottom to top; each holds shape clips.
  // A clip: el is a coded shape from assets/elements.js; shape is a drawing,
  // shapes/<name>.svg, drawn at each of its spots. On from `from` through `to`:
  // a bar number, or a moment's name to land right on it. in / out: "cut",
  // "fade" or "clap". spotsMode: all (every spot), turns (one per hit of moveOn),
  // one (a single copy moves between spots, switching by jump, blink or slide;
  // moveBars caps the moving). A spot is [x, y, size]; add -1 to mirror it there,
  // then degrees to turn it. hidden: true keeps a whole layer off the square.
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
          fx: [{ kind: "pulse", on: "Pulse", to: "#ffffff", amount: 0.9, beats: 6 }],
        },
      ],
    },
    {
      // Tilted strokes across the bottom third: one appears per hit of
      // "bongo drum start" (left to right, in spot order), each sized by the
      // wave's loudness at that hit. Tap the full drum pattern into the
      // moment and every tap lands a line.
      name: "bongos",
      clips: [
        {
          shape: "line",
          from: "bongo drum start",
          to: 40,
          spotsMode: "turns",
          moveOn: "bongo drum start",
          sizeFrom: "wave",
          spots: [
            [0.12, 0.82, 0.05, 1, -30], [0.2, 0.82, 0.05, 1, -30], [0.28, 0.82, 0.05, 1, -30],
            [0.36, 0.82, 0.05, 1, -15], [0.44, 0.82, 0.05], [0.52, 0.82, 0.05], [0.6, 0.82, 0.05],
            [0.68, 0.82, 0.05, 1, 15], [0.76, 0.82, 0.05, 1, 30], [0.84, 0.82, 0.05, 1, 30],
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
          outBeats: 4,
          spots: [[0.11, 0.11, 0.055], [0.89, 0.11, 0.055, -1]],
          fx: [{ kind: "hop", on: "eye panning" }],
        },
      ],
    },
  ],
};
