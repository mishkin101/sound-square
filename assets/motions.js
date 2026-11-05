// sound-square motions: how a shape moves with the song.
//
// A shape keeps a list of motions (saved in its SVG). Each one moves the whole
// shape or one part of it, and follows something in the music:
//   { do: "blink", part: "lid", on: "random", everyBars: 2, beats: 0.35, pivot: "top" }
//
// on: enter (when the layer comes in; spots take turns in their opening order),
//     beat, bar, claps, bongos (a kick on each, fading), keys (rises while keys
//     are held), energy (the song's 0-1 curve), random (blink only: a moment in
//     every few bars), always (keeps going).
//
// Amounts are in shape sizes: 1 is the shape's half-width, as a spot's size is.
// Every spot gets its own randomness, so a row of eyes doesn't move as one.

const PIVOTS = ["center", "top", "bottom", "left", "right"];
const KICKS = ["beat", "bar", "claps", "bongos"];

// Each motion: what it follows (the first is the default) and its sliders,
// name: [default, min, max, step]. `pivot` adds a menu for where it scales or turns from.
const MOTIONS = {
  pop: { label: "pop in", ons: ["enter"], pivot: true, params: { beats: [1, 0.25, 8, 0.25], stagger: [4, 0, 16, 0.5] } },
  fade: { label: "fade in", ons: ["enter"], params: { beats: [2, 0.25, 16, 0.25], stagger: [4, 0, 16, 0.5] } },
  drawIn: { label: "draw in", ons: ["enter"], params: { beats: [4, 0.5, 32, 0.5], stagger: [4, 0, 16, 0.5] } },
  pulse: { label: "pulse", ons: [...KICKS, "keys", "energy"], pivot: true, params: { amount: [0.15, 0, 1, 0.01], decay: [5, 1, 12, 0.5] } },
  jump: { label: "jump", ons: KICKS, params: { amount: [0.15, 0, 1, 0.01], decay: [5, 1, 12, 0.5] } },
  blink: { label: "blink", ons: ["random", ...KICKS], pivot: true, params: { everyBars: [2, 0.5, 8, 0.5], beats: [0.35, 0.1, 2, 0.05] } },
  drift: { label: "drift", ons: ["always", "energy"], params: { amount: [0.2, 0, 1, 0.01], speed: [0.08, 0.01, 0.5, 0.01] } },
  sway: { label: "sway", ons: ["always", "energy"], pivot: true, params: { degrees: [8, 0, 45, 1], beats: [4, 0.5, 16, 0.5] } },
  spin: { label: "spin", ons: ["always", "energy"], params: { turnsPerBar: [0.25, -2, 2, 0.05] } },
  boil: { label: "boil", ons: ["always"], params: { amount: [0.015, 0, 0.08, 0.001], perBeat: [4, 1, 12, 1] } },
};

const MOTION_NOTES = {
  pop: "Springs open from nothing",
  fade: "Fades in",
  drawIn: "Lines appear one by one, in the order they were drawn",
  pulse: "Swells, then settles",
  jump: "Hops up, then settles",
  blink: "Squashes shut for a moment",
  drift: "Wanders around its place",
  sway: "Swings back and forth",
  spin: "Turns",
  boil: "Shakes a little, like hand-drawn animation",
};

function newMotion(kind, keep = {}) {
  const def = MOTIONS[kind], m = { do: kind, part: keep.part ?? "all", on: def.ons[0] };
  for (const [k, [v]] of Object.entries(def.params)) m[k] = v;
  if (def.pivot) m.pivot = "center";
  return m;
}

// The motions saved in an SVG, or none.
const MOTION_BLOCK = /[ \t]*<metadata id="sound-square-motion"><!\[CDATA\[([\s\S]*?)\]\]><\/metadata>\n?/;
function readMotions(text) {
  try { return (JSON.parse(MOTION_BLOCK.exec(text)?.[1] ?? "[]") || []).filter((m) => MOTIONS[m.do]); } catch { return []; }
}

// ---- One frame -----------------------------------------------------------------

// How a shape is moved right now at one spot. `shape` gives its boxes, in its
// own units: { box, parts: { name: box }, half }. age: beats since its layer
// came in. Returns per-target matrices and alphas; see itemFx.
function motionFrame(motions, shape, s, age, spot) {
  const frame = { hidden: false, targets: new Map(), reveal: null };
  for (const m of motions) {
    const box = m.part === "all" ? shape.box : shape.parts[m.part];
    if (!box) continue;
    const t = frame.targets.get(m.part) ?? { m: new DOMMatrix(), a: 1 };
    const fx = motionEffect(m, s, age, spot, box, shape.half);
    if (fx.hidden) { if (m.part === "all") frame.hidden = true; else t.a = 0; }
    if (fx.m) t.m = t.m.multiply(fx.m);
    if (fx.a != null) t.a *= fx.a;
    if (fx.reveal != null && m.part === "all") frame.reveal = Math.min(frame.reveal ?? 1, fx.reveal);
    if (fx.reveal != null && m.part !== "all") t.reveal = Math.min(t.reveal ?? 1, fx.reveal);
    frame.targets.set(m.part, t);
  }
  return frame;
}

// One item's matrix and alpha: the whole shape's motion, then those of each part
// it's in (outermost first). index/count: its place in drawing order, for draw-in.
function itemFx(frame, parts, index, count) {
  let m = null, a = 1;
  const apply = (t) => {
    if (!t) return;
    m = m ? m.multiply(t.m) : t.m;
    a *= t.a;
    if (t.reveal != null) a *= revealed(t.reveal, index, count);
  };
  apply(frame.targets.get("all"));
  for (const p of parts) apply(frame.targets.get(p));
  if (frame.reveal != null) a *= revealed(frame.reveal, index, count);
  return { m, a };
}

// Draw-in: item i of n fades in over its share of the time.
function revealed(r, i, n) { return clamp01(r * n - i); }

function pivotOf(box, pivot) {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  return {
    center: [cx, cy], top: [cx, box.y0], bottom: [cx, box.y1], left: [box.x0, cy], right: [box.x1, cy],
  }[pivot ?? "center"] ?? [cx, cy];
}

function about([px, py], m) { return new DOMMatrix().translate(px, py).multiply(m).translate(-px, -py); }

// Beats since the last beat, bar, clap or bongo hit (null if none yet).
function motionSince(m, s) {
  switch (m.on) {
    case "beat": return s.B - Math.floor(s.B);
    case "bar": return s.B - Math.floor(s.B / s.bpb) * s.bpb;
    case "claps": case "bongos": return s.since(m.on);
    default: return null;
  }
}

// 0-1: how strongly the music is pushing this motion now.
function motionLevel(m, s) {
  switch (m.on) {
    case "beat": case "bar": case "claps": case "bongos": return kick(motionSince(m, s), m.decay ?? 5);
    case "keys": return s.hold("keys", 1, 3);
    case "energy": return s.energy;
    default: return 1;
  }
}

function motionEffect(m, s, age, spot, box, half) {
  const seed = spot * 7.3 + 1.1, level = motionLevel(m, s);
  const turn = age - spot * (m.stagger ?? 0); // spots take turns coming in
  switch (m.do) {
    case "pop":
      if (turn < 0) return { hidden: true };
      return { m: about(pivotOf(box, m.pivot), new DOMMatrix().scale(Math.max(0.001, easeOutBack(turn / m.beats)))) };
    case "fade":
      if (turn < 0) return { hidden: true };
      return { a: clamp01(turn / m.beats) };
    case "drawIn":
      if (turn < 0) return { hidden: true };
      return { reveal: clamp01(turn / m.beats) };
    case "pulse":
      return { m: about(pivotOf(box, m.pivot), new DOMMatrix().scale(1 + m.amount * level)) };
    case "jump":
      return { m: new DOMMatrix().translate(0, -m.amount * level * half) };
    case "blink": {
      let b;
      if (m.on === "random") { // one blink at a random moment in every few bars
        const span = m.everyBars * s.bpb, cycle = Math.floor(s.B / span);
        const d = s.B - (cycle * span + hash(spot, cycle) * Math.max(0, span - m.beats));
        b = d > 0 && d < m.beats ? Math.sin((Math.PI * d) / m.beats) : 0;
      } else { // shut on each hit, open again over `beats`
        const d = motionSince(m, s);
        b = d != null && d < m.beats ? Math.sin((Math.PI * d) / m.beats) : 0;
      }
      return { m: about(pivotOf(box, m.pivot), new DOMMatrix().scale(1, 1 - 0.92 * b)) };
    }
    case "drift": {
      const k = m.on === "energy" ? s.energy : 1, t = s.B * m.speed;
      return { m: new DOMMatrix().translate((noise(seed, t) - 0.5) * 2 * m.amount * half * k, (noise(seed + 40, t) - 0.5) * 2 * m.amount * half * k) };
    }
    case "sway": {
      const k = m.on === "energy" ? s.energy : 1;
      return { m: about(pivotOf(box, m.pivot), new DOMMatrix().rotate(m.degrees * k * Math.sin((2 * Math.PI * s.B) / m.beats + spot * 1.7))) };
    }
    case "spin": {
      const k = m.on === "energy" ? s.energy : 1;
      return { m: about(pivotOf(box), new DOMMatrix().rotate((360 * m.turnsPerBar * k * s.B) / s.bpb)) };
    }
    case "boil": {
      const step = Math.floor(s.B * m.perBeat), j = (n) => (hash(step, spot * 31 + n) - 0.5) * 2;
      return { m: about(pivotOf(box), new DOMMatrix().translate(j(1) * m.amount * half, j(2) * m.amount * half).rotate(j(3) * m.amount * 120)) };
    }
  }
  return {};
}
