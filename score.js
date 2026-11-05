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
  // Timing grid: the song sits at 126 BPM throughout; bar 1 still needs
  // marking against the real recording.
  bpm: 126,
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
  // Color pulses: a palette slot moving toward a color between two moments.
  // beats: the cycle. back: "snap" builds then snaps back, "fade" breathes,
  // "decay" lands bright on the beat and dies away. amount: how far it goes.
  // The opening: the ground breathes slowly, a pulse every three beats, the
  // whole time the eyes are up — gone when the bongos come in.
  colorMoves: [
    { slot: "ground", to: "#ffffff", amount: 0.35, beats: 3, back: "fade", from: "stick tap", until: "bongos in" },
  ],
  // Names for the timeline. Number keys 1-6 jump to them.
  sections: [],
  // Things you hear, marked on the song (M in the studio while it plays; held
  // down, M marks a hold: [start, end] in beats, a span like the bongo section).
  // Layers come in and leave on them, spots move on their hits, pulses run between them.
  // Each can carry a note; hide: true keeps its marker off the timeline.
  moments: [
    { name: "stick tap", hits: [0] },
    { name: "fast taps", hits: [3, 3.5], note: "the fast 4/5 after three waiting beats", hide: true },
    { name: "bongos in", hits: [32] },
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
  // from that key on; ease: "line" keeps the approach linear, "snap" holds
  // and jumps there right on the key (a flash). Keys replace the
  // spot modes. keysFrom names the moment whose drawn path made them: editing
  // that path in the studio re-samples the keys. fx: [{ kind, amount, rate,
  // from, to }] are effects on the shape (spin, breathe, wobble), each running
  // in its own window or the clip's whole life — or with keys of its own:
  // keys: [{ at, amount }], the amount eased over time (0 is off), replacing
  // from/to as the envelope.
  layers: [
    { name: "ground", clips: [{ el: "ground", from: 1, to: 48 }] },
    {
      name: "eyes",
      clips: [
        // The opening, her first square: an eye in each top corner, facing
        // each other. The left one opens on the stick tap; the right one
        // flashes in on the fast 4/5. Both hold until the bongos come in.
        {
          shape: "eye",
          from: "stick tap",
          to: "bongos in",
          out: "fade",
          outBeats: 2,
          spots: [[0.11, 0.11, 0.055]],
        },
        {
          shape: "eye",
          from: "fast taps",
          to: "bongos in",
          out: "fade",
          outBeats: 2,
          spots: [[0.89, 0.11, 0.055, -1]],
        },
      ],
    },
  ],
};
