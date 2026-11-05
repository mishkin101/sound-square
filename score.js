// sound-square score: what the square does, bar by bar.
// Bar 1 is the first downbeat. Inside a bar, beats count from 0 (the downbeat) to 3.
// Edit by hand, or tune with the studio's sliders and use "Copy score.js".

const SCORE = {
  // The song.
  song: {
    title: "I Haven't Recovered From Last Night With You",
    artist: "Divorce from New York",
    spotifyId: "0KJKIGebZqDyMoxI2NMpL0",
  },
  // Timing grid: tapped along to the real song.
  bpm: 125.874,
  beatsPerBar: 4,
  firstDownbeatMs: 731,
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
  // Color pulses: a palette slot moving toward a color. With `on`, the pulse
  // rides that moment's taps: one pulse per hit, bright right on the tap and
  // dying away over `beats`. With from/until instead, it cycles between two
  // moments: back "snap" builds then snaps back, "fade" breathes, "decay"
  // lands bright on the beat and dies away. amount: how far it goes.
  colorMoves: [
    { slot: "ground", to: "#ffffff", amount: 0.35, beats: 3, on: "Pulse" },
  ],
  // Names for the timeline. Number keys 1-6 jump to them.
  sections: [],
  // Things you hear, marked on the song (M in the studio while it plays; held
  // down, M marks a hold: [start, end] in beats, a span like the bongo section).
  // Layers come in and leave on them, spots move on their hits, pulses run between them.
  // Each can carry a note; hide: true keeps its marker off the timeline.
  // repeat: { every, times } plays the tapped pattern again `times` more
  // times, `every` beats apart — hops and pulses follow, markers don't multiply.
  moments: [
    // Every tap of "eye moves" moves the eye — the moment IS the choreography.
    // "eye panning" keeps her full tapped record (all ten taps, the felt beats
    // too), off the timeline but there to retap or mine later.
    { name: "eye moves", hits: [9.25, 13.28] },
    { name: "eye panning", hits: [6.31, 6.99, 7.71, 8.81, 9.25, 10.31, 11.04, 11.76, 12.83, 13.28], hide: true, note: "the full tapped record; the quick pairs became eye moves" },
    { name: "Bongo drum Start", hits: [14.28] },
    { name: "Pulse", hits: [10.04, 14.08] },
  ],
  // Layers are named rows on the timeline, drawn bottom to top; each holds shape clips.
  // A clip: el is a coded shape from assets/elements.js; shape is a drawing,
  // shapes/<name>.svg, drawn at each of its spots. On from `from` through `to`:
  // a bar number, or a moment's name to land right on it. in / out: "cut",
  // "fade" or "clap". spotsMode: all (every spot), turns (one per hit of moveOn),
  // one (a single copy moves between spots, switching by jump, blink or slide;
  // moveBars caps the moving; switchUnder: only a hit within that many beats
  // of the hit before moves it). A spot is [x, y, size]; add -1 to mirror it there,
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
  // from/to as the envelope. A hop effect moves one copy between the spots:
  // { kind: "hop", on: a moment's name — every tap moves it to the next spot.
  // order: "cycle" (default), "bounce" (back and forth) or "random" (stable);
  // by: jump, blink or slide; under: an optional filter — only a tap within
  // that many beats of the tap before moves it, for a moment whose taps
  // aren't all moves }. On a raw clip the same order is spotOrder.
  layers: [
    { name: "ground", clips: [{ el: "ground", from: 1, to: 216 }] },
    {
      name: "eyes",
      clips: [
        // The opening: one eye, top left, facing right. The hop rides
        // "eye moves": each tap flashes it to the other corner (mirrored to
        // face back). It leaves when the bongo drums start. Re-tapping the
        // moment retimes it all.
        {
          shape: "eye",
          from: 1,
          to: "Bongo drum Start",
          out: "fade",
          outBeats: 2,
          spots: [[0.11, 0.11, 0.055], [0.89, 0.11, 0.055, -1]],
          fx: [{ kind: "hop", on: "eye moves" }],
        },
      ],
    },
  ],
};
