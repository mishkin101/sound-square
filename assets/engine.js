// sound-square engine: time, events, layers and color.
// Everything is a pure function of the song position, so playing, scrubbing
// and (later) Spotify sync all draw exactly the same frames.

let SQ = 600; // the square's size in pixels this frame
function px(n) { return n / SQ; } // pixels -> square units, for line widths

// ---- Time --------------------------------------------------------------------
// Song positions are counted in beats from the first downbeat:
// bar 1 beat 1 is 0, bar 2 beat 1 is 4 (in 4/4).

function beatMs(score) { return 60000 / score.bpm; }
function msToBeats(score, ms) { return (ms - score.firstDownbeatMs) / beatMs(score); }
function beatsToMs(score, beats) { return score.firstDownbeatMs + beats * beatMs(score); }
function barToBeats(score, bar) { return (bar - 1) * score.beatsPerBar; }
function songBeats(score) { return score.bars * score.beatsPerBar; }
function songMs(score) { return beatsToMs(score, songBeats(score)); }

// Fits a steady tempo to taps on downbeats (song positions in ms). Returns the
// BPM, where bar 1 falls (the earliest downbeat at or after 0 ms) and how far
// the taps sit from the fitted grid. A skipped bar still counts as a bar.
function fitGrid(taps, beatsPerBar) {
  if (taps.length < 4) return null;
  const gaps = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
  const guess = gaps[Math.floor(gaps.length / 2)];
  if (!(guess > 200)) return null;
  const idx = taps.map((t) => Math.round((t - taps[0]) / guess));
  const n = taps.length;
  const mi = idx.reduce((s, x) => s + x, 0) / n, mt = taps.reduce((s, x) => s + x, 0) / n;
  let sxy = 0, sxx = 0;
  for (let k = 0; k < n; k++) { sxy += (idx[k] - mi) * (taps[k] - mt); sxx += (idx[k] - mi) ** 2; }
  if (!sxx) return null;
  const barMs = sxy / sxx, start = mt - barMs * mi;
  const rmsMs = Math.sqrt(taps.reduce((s, t, k) => s + (t - (start + barMs * idx[k])) ** 2, 0) / n);
  return { bpm: (60000 * beatsPerBar) / barMs, firstDownbeatMs: ((start % barMs) + barMs) % barMs, rmsMs };
}

// ---- Moments -----------------------------------------------------------------
// Named things you hear in the song ("stick tap", "bongos in"), marked while it
// plays (M in the studio). A moment is one or more hits, in beats. Layers come
// in and leave on them, spots move on their hits, color pulses run between them.

function momentHits(score, name) {
  return score.moments?.find((m) => m.name === name)?.hits ?? [];
}

// Where a moment starts: its first hit, or null if there's no such moment.
function momentStart(score, name) {
  const h = momentHits(score, name);
  return h.length ? Math.min(...h) : null;
}

// ---- Events ------------------------------------------------------------------

// The score, ready to play: tracks as sorted beat times, energy keys in beats.
// Moments come along as tracks too, so hits/since/last work on them by name.
function prepare(score) {
  const tracks = {};
  for (const [name, tr] of Object.entries(score.tracks || {})) {
    if (tr.holds) {
      tracks[name] = {
        holds: tr.holds
          .map(([bar, beat, len]) => { const s = barToBeats(score, bar) + beat; return { s, e: s + len }; })
          .sort((a, b) => a.s - b.s),
      };
      continue;
    }
    const hits = [];
    if (tr.pattern) {
      for (let bar = tr.bars[0]; bar <= tr.bars[1]; bar++) {
        for (const beat of tr.pattern) hits.push(barToBeats(score, bar) + beat);
      }
    }
    for (const [bar, beat] of tr.hits || []) hits.push(barToBeats(score, bar) + beat);
    tracks[name] = { hits: hits.sort((a, b) => a - b) };
  }
  for (const m of score.moments || []) {
    if (!tracks[m.name]) tracks[m.name] = { hits: [...m.hits].sort((a, b) => a - b) };
  }
  const energy = (score.energy || []).map(([bar, v]) => [barToBeats(score, bar), v]);
  return { tracks, energy };
}

// Index of the last hit at or before B, or -1.
function lastIndex(hits, B) {
  let lo = 0, hi = hits.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid] <= B) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

// The first hit at or after B, or null.
function firstAtOrAfter(hits, B) {
  const i = lastIndex(hits, B - 1e-9) + 1;
  return i < hits.length ? hits[i] : null;
}

// 1 right on a hit, fading toward 0. Higher decay = shorter flash.
function kick(since, decay) {
  return since == null || since < 0 ? 0 : Math.exp(-since * decay);
}

// How far held keys have pushed: rises while held (a longer hold goes higher), falls after.
function holdLevel(holds, B, attack, release) {
  let level = 0;
  for (const h of holds) {
    if (h.s > B) break;
    const peak = 1 - Math.exp(-(Math.min(B, h.e) - h.s) / attack);
    level = Math.max(level, B <= h.e ? peak : peak * Math.exp(-(B - h.e) / release));
  }
  return level;
}

// Energy 0-1, blended smoothly between the score's keys.
function energyAt(world, B) {
  const k = world.energy;
  if (!k.length) return 0.5;
  if (B <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (B < k[i][0]) {
      const f = smoothstep((B - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f;
    }
  }
  return k[k.length - 1][1];
}

// ---- Color -------------------------------------------------------------------
// Palettes share the same slots, so any two can blend. Blending runs in OKLCH,
// which keeps in-between colors vivid instead of going muddy or grey.

function mix(a, b, f) { return chroma.mix(a, b, f, "oklch").hex(); }
function rgba(hex, a) { const [r, g, b] = chroma(hex).rgb(); return `rgba(${r},${g},${b},${a})`; }

function paletteAt(score, B) {
  const keys = score.colors;
  let k = 0;
  for (let i = 1; i < keys.length; i++) if (barToBeats(score, keys[i][0]) <= B) k = i;
  const cur = score.palettes[keys[k][1]];
  const f = (B - barToBeats(score, keys[k][0])) / (score.colorFadeBars * score.beatsPerBar);
  if (k === 0 || !(f < 1)) return cur;
  const prev = score.palettes[keys[k - 1][1]], t = smoothstep(f), out = {};
  for (const [slot, c] of Object.entries(cur)) {
    out[slot] = Array.isArray(c)
      ? c.map((ci, i) => mix(prev[slot]?.[i] ?? ci, ci, t))
      : mix(prev[slot] ?? c, c, t);
  }
  return out;
}

// The palette right now, with the score's color pulses applied: a slot breathing
// toward a color between two moments (the opening's ground fading to white every
// four beats until the bongos come in). `back`: "snap" rises and starts over,
// "fade" comes back down too. `to` is a hex color or another slot's name.
function colorsNow(score, B) {
  let col = paletteAt(score, B);
  for (const cm of score.colorMoves || []) {
    const from = cm.from ? momentStart(score, cm.from) : 0;
    const until = cm.until ? momentStart(score, cm.until) : songBeats(score);
    if (from == null || until == null || B < from || B >= until) continue;
    const base = col[cm.slot];
    if (typeof base !== "string") continue;
    const phase = ((((B - from) / (cm.beats || 4)) % 1) + 1) % 1;
    const t = smoothstep(cm.back === "fade" ? 1 - Math.abs(2 * phase - 1) : phase);
    col = { ...col, [cm.slot]: mix(base, col[cm.to] ?? cm.to, t * (cm.amount ?? 1)) };
  }
  return col;
}

// ---- Layers ------------------------------------------------------------------
// A layer is one element, on from bar `from` through bar `to`. Either end can
// also be a moment's name: it comes in or leaves right on that moment.
// in / out: "cut", "fade" (over inBeats / outBeats), or "clap": on the first
// clap at or after the change, a clap line sweeps down the square with the
// new layers above it and the old ones below.

const TRANSITION_BEATS = { cut: 0, fade: 2, clap: 0.5 };

function layerTiming(score, world, L) {
  const s = typeof L.from === "string" ? momentStart(score, L.from) ?? 0 : barToBeats(score, L.from);
  const e = typeof L.to === "string" ? momentStart(score, L.to) ?? songBeats(score) : barToBeats(score, L.to + 1);
  const inType = L.in || "cut", outType = L.out || "cut";
  const claps = world.tracks.claps?.hits || [];
  const at = (type, b) => (type === "clap" ? firstAtOrAfter(claps, b) ?? b : b);
  return {
    s, e, inType, outType,
    inAt: at(inType, s), inLen: L.inBeats ?? TRANSITION_BEATS[inType],
    outAt: at(outType, e), outLen: L.outBeats ?? TRANSITION_BEATS[outType],
  };
}

// The layer right now: null when it's off; otherwise how visible it is, which
// band of the square it shows in (clip, during a clap change), and its age in
// beats since it came in.
function layerState(score, world, L, B) {
  const T = layerTiming(score, world, L);
  if (B < T.inAt || B >= T.outAt + T.outLen) return null;
  let vis = 1, clip = null;
  if (T.inLen > 0 && B < T.inAt + T.inLen) {
    const k = ease((B - T.inAt) / T.inLen);
    if (T.inType === "fade") vis = k;
    if (T.inType === "clap") clip = [0, k];
  }
  if (B >= T.outAt) {
    const k = ease((B - T.outAt) / T.outLen);
    if (T.outType === "fade") vis *= 1 - k;
    if (T.outType === "clap") clip = [k, 1];
  }
  return { T, vis, clip, age: B - T.inAt, local: B - T.s };
}

// What every element can read this frame.
function frameState(score, world, B) {
  const tracks = world.tracks;
  const hitsOf = (name) => tracks[name]?.hits || [];
  return {
    B,
    bpb: score.beatsPerBar,
    beat: B - Math.floor(B), // 0 on each beat, rising toward 1
    energy: energyAt(world, B),
    energyAt: (b) => energyAt(world, b),
    col: colorsNow(score, B),
    // beats since the last hit on a track (null if none yet)
    since(name) { const h = hitsOf(name), i = lastIndex(h, B); return i < 0 ? null : B - h[i]; },
    // the last hit as { i, t }, and any hit's time by its index
    last(name) { const h = hitsOf(name), i = lastIndex(h, B); return i < 0 ? null : { i, t: h[i] }; },
    hitTime(name, i) { const h = hitsOf(name); return i >= 0 && i < h.length ? h[i] : null; },
    // hits between two positions, as [index, time]
    hits(name, from, to) {
      const h = hitsOf(name), out = [];
      for (let i = lastIndex(h, from - 1e-9) + 1; i < h.length && h[i] <= to; i++) out.push([i, h[i]]);
      return out;
    },
    // 0-1: how far held keys have pushed
    hold(name, attack, release) { return holdLevel(tracks[name]?.holds || [], B, attack, release); },
  };
}

// ---- Small helpers -----------------------------------------------------------

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function smoothstep(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function ease(x) { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function easeOut(x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); }
function easeOutBack(x) { x = clamp01(x); const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }

// A repeatable random number 0-1 for a pair of integers. "Random" shapes use
// this instead of Math.random, so the same moment always looks the same.
function hash(a, b = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
