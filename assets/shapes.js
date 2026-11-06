// sound-square shapes: your drawings, as SVG files in shapes/.
//
// A layer with `shape: "eye"` draws shapes/eye.svg at each of its spots. The
// drawing is fitted so its longer side spans a spot's size on each side of the
// spot's center, so [x, y, size] means the same as for the coded elements.
//
// Groups in the SVG (Figma and Illustrator layers, Inkscape labels) are kept as
// part names, so motions can move a pupil or a lid by itself later.
//
// A color can follow a palette slot: data-fill-slot="ink" or data-stroke-slot="line"
// on an element (the Shapes tab sets these). Other colors stay as drawn.
//
// A shape's motions (motions.js) are saved in it too, and run at every spot.
//
// A layer can show every spot at once, let them take turns (one appears per
// hit), or move one copy between spots on each hit (spotsMode, set in the
// layer's box; the hits come from `moveOn`: a moment, beats, bars, claps or
// bongos; `moveBars` caps the moving to the first few bars). A spot's fourth
// value of -1 mirrors the drawing there; a fifth turns it that many degrees;
// a sixth skews it that many degrees (a parallelogram lean, + leans the top
// to the right) with the top and bottom kept level.

const SHAPES = {}; // name -> { status, error, items, parts, motions, moves, cx, cy, k, text }

// The palette slots a drawn color can follow. dreamy1-5 are the dreamy tones.
const PAINT_SLOTS = ["ground", "glow", "line", "ink", "light", "dreamy1", "dreamy2", "dreamy3", "dreamy4", "dreamy5"];

// The elements a layer can use: its own `el`, or the shape element for drawings.
function elementOf(L) { return L.shape ? ELEMENTS.shape : ELEMENTS[L.el]; }
function layerName(L) { return L.shape ?? L.el; }

ELEMENTS.shape = {
  note: "Your drawing",
  spots: [[0.5, 0.5, 0.1]],
  params: { size: [1, 0.25, 3, 0.05] },
  draw(P, s, st) {
    const sh = SHAPES[P.shape];
    if (!sh?.items) return;
    // keys drive the place over time; while editing the spots show instead
    if (P.keys?.length && !P.editing) return drawKeyed(sh, P, s, st);
    const mode = P.spots.length > 1 ? P.spotsMode ?? "all" : "all";
    const step = mode === "all" ? null : spotStep(P, s, st);
    if (mode === "one") return drawOneSpot(sh, P, s, st, step);
    const fx = fxNow(P, s, st);
    // loop: once every spot has shown, the turns start over from the first
    const cyc = step && P.loop ? Math.floor(step.n / P.spots.length) : 0;
    const shown = step ? (P.loop ? step.n % P.spots.length : step.n) : 0;
    const fol = followOf(P);
    const reach = fol ? followScales(P, s, st, sh, cyc, fol) : null;
    const byHeight = (fol?.target ?? "height") === "height";
    const mid = fx.osc.length ? [0, 1].map((a) => P.spots.reduce((t, sp) => t + sp[a], 0) / P.spots.length) : null;
    // a fill's fade: each spot fades in over that many beats from its turn
    const fade = step ? P.fx?.find((f) => f.kind === "fill")?.fade ?? 0 : 0;
    const turnAt = fade > 0 ? spotHitBeats(P, s, st, cyc) : null;
    // a pulse on the shape itself: flash shows the shape only on the pulse
    // (its own look, fading out over the decay); tint keeps it showing and
    // washes it toward the pulse color on each hit
    // (a clip can wear several, each in its own window; the one in its window acts)
    const sp = selfPulseNow(P, s.B);
    const shapeAlpha = sp?.flashing ? sp.w : 1;
    const rings = P.fx?.filter((f) => f.kind === "ripple").flatMap((f) => ripplesNow(f, s.B)) ?? [];
    if (shapeAlpha <= 0.001 && !rings.length) return;
    P.spots.forEach(([x, y, size, flip = 1, deg = 0, skew = 0], i) => {
      if (step && i > shown) return; // take turns: spot i waits for the i-th hit
      const frame = sh.motions.length ? motionFrame(sh.motions, sh.moves, s, st.age, i) : null;
      if (frame?.hidden) return;
      const fadeIn = turnAt && turnAt[i] != null ? clamp01((s.B - turnAt[i]) / fade) : 1;
      if (fadeIn <= 0.001) return;
      const kf = reach ? reach[i] : 1, wv = byHeight ? 1 : kf;
      let ox = 0, oy = 0;
      for (const o of fx.osc) {
        const away = o.axis === "y" ? y - mid[1] : x - mid[0];
        const dir = o.mirror ? (Math.abs(away) < 1e-6 ? 0 : Math.sign(away)) : 1;
        if (o.axis === "y") oy += o.v * dir;
        else ox += o.v * dir;
      }
      push();
      drawingContext.globalAlpha *= fadeIn;
      translate(x + fx.dx + ox, y + fx.dy + oy);
      if (deg || fx.rot) rotate((deg * Math.PI) / 180 + fx.rot);
      if (skew) shearX((-skew * Math.PI) / 180);
      scale(flip * size * P.size * fx.k * wv, size * P.size * fx.k * wv);
      if (byHeight && kf !== 1) { // stretch from the edge that stays put
        translate(0, reach.anchor[i]);
        scale(1, kf);
        translate(0, -reach.anchor[i]);
      }
      if (shapeAlpha > 0.001) drawPainted(sh, s, P, i, frame, sp);
      for (const r of rings) drawRing(sh, s, r, size * P.size * fx.k * wv);
      pop();
    });
  },
};

// One copy wherever the clip's keys put it right now (see keyedPlace).
function drawKeyed(sh, P, s, st) {
  const k = keyedPlace(SCORE, P.keys, s.B);
  if (k.fade <= 0.001 || k.size <= 0.001) return;
  const frame = sh.motions.length ? motionFrame(sh.motions, sh.moves, s, st.age, 0) : null;
  if (frame?.hidden) return;
  const fx = fxNow(P, s, st);
  push();
  drawingContext.globalAlpha *= clamp01(k.fade);
  translate(k.x + fx.dx, k.y + fx.dy);
  if (k.deg || fx.rot) rotate((k.deg * Math.PI) / 180 + fx.rot);
  scale(k.flip * k.size * P.size * fx.k, k.size * P.size * fx.k);
  drawShape(sh, s.col, drawingContext, frame);
  pop();
}

// What the clip's effects do to it right now: a shift, a turn, a scale. Each
// effect runs inside its own window (from/to like a clip's, or the clip's own).
const NO_FX = { dx: 0, dy: 0, rot: 0, k: 1, osc: [] };
// an effect's amount when it doesn't set one
const FX_AMOUNT = { spin: 1, oscillate: 0.05 };

function fxNow(P, s, st) {
  if (!P.fx?.length) return NO_FX;
  let dx = 0, dy = 0, rot = 0, k = 1;
  const osc = [];
  for (const f of P.fx) {
    let amt, from;
    if (f.keys?.length) {
      // the effect's own keys are its envelope: amount over time, 0 is off
      amt = keyedValue(SCORE, f.keys, s.B, "amount", 0);
      from = keyBeat(SCORE, f.keys[0].at);
    } else {
      from = f.from == null ? st.T?.s ?? 0
        : typeof f.from === "string" ? momentStart(SCORE, f.from) ?? 0 : barToBeats(SCORE, f.from);
      const to = f.to == null ? st.T?.e ?? 1e9
        : typeof f.to === "string" ? momentEnd(SCORE, f.to) ?? 1e9 : barToBeats(SCORE, f.to + 1);
      if (s.B < from || s.B >= to) continue;
      amt = f.amount ?? FX_AMOUNT[f.kind] ?? 0.5;
    }
    if (amt <= 0.001) continue;
    const rate = f.rate ?? 1;
    if (f.kind === "spin") {
      rot += amt * ((s.B - from) / (rate * s.bpb)) * 2 * Math.PI; // rate: bars per turn
    } else if (f.kind === "breathe") {
      const phase = (((s.B - from) % rate) + rate) % rate; // rate: beats per breath
      k *= 1 + 0.4 * amt * Math.exp(-3 * phase);
    } else if (f.kind === "wobble") {
      dx += 0.08 * amt * (noise(s.B * 1.5 * rate, 7) - 0.5) * 2; // rate: how fast it shivers
      dy += 0.08 * amt * (noise(s.B * 1.5 * rate, 13) - 0.5) * 2;
    } else if (f.kind === "oscillate") {
      // back and forth along an axis: out by `amount` right on the grid every
      // `rate` beats, back to rest halfway between; mirror sends each copy
      // away from the middle of the spot set, together moves them all one way
      osc.push({
        axis: f.axis ?? "x",
        mirror: (f.direction ?? "mirror") === "mirror",
        v: amt * 0.5 * (1 + Math.cos((2 * Math.PI * s.B) / rate)),
      });
    }
  }
  return { dx, dy, rot, k, osc };
}

// The grid line the steps count from: the first step lands on the first grid
// line at least a third of a step after the clip comes in, so a clip that
// comes in on a tapped moment never lands two at once.
function stepOrigin(inAt, every) { return Math.ceil((inAt + every / 3) / every - 1e-9) - 1; }

// When each spot's turn lands, in beats (for pass `cyc` of a looping fill):
// step 0 is the clip coming in, step n the n-th grid line or trigger hit
// after it; spot j of pass c is step c * (number of spots) + j.
function spotHitBeats(P, s, st, cyc = 0) {
  const inAt = st.T?.inAt ?? 0, first = cyc * P.spots.length;
  const every = stepBeats(P, s);
  if (every) {
    const g0 = stepOrigin(inAt, every);
    return P.spots.map((_, i) => (first + i ? (g0 + first + i) * every : inAt));
  }
  if (!P.moveOn) return null;
  const hits = s.hits(P.moveOn, inAt + 1e-6, 1e9).map((h) => h[1]);
  return P.spots.map((_, i) => (first + i ? hits[first + i - 1] ?? null : inAt));
}

// The paint for spot i (0-based): the paint effect listing it in `spots`
// (1-based, as the pane numbers them), else one with no `spots`.
function paintFor(P, i) {
  const paints = P.fx?.filter((f) => f.kind === "paint") ?? [];
  return paints.find((f) => f.spots?.includes(i + 1)) ?? paints.find((f) => !f.spots?.length) ?? null;
}

// The shape pulse acting now: of the clip's pulses on itself, the one in its
// window. { f, w, flashing } or null.
function selfPulseNow(P, B) {
  for (const f of P.fx ?? []) {
    if (f.kind !== "pulse" || f.slot !== "shape") continue;
    const w = flashNow(f, B);
    if (w != null) return { f, w, flashing: (f.mode ?? "flash") === "flash" };
  }
  return null;
}

// Draws one copy with its paint and its shape pulse (the caller has placed it).
function drawPainted(sh, s, P, i, frame, sp) {
  const ctx = drawingContext, a0 = ctx.globalAlpha, paint = paintFor(P, i);
  if (sp?.flashing) ctx.globalAlpha = a0 * sp.w;
  if (paint) paintShape(sh, s, paint, i);
  else drawShape(sh, s.col, ctx, frame);
  if (sp && !sp.flashing && sp.w > 0.001) {
    ctx.globalAlpha *= sp.w;
    paintShape(sh, s, { style: "solid", color: sp.f.to ?? "#ffffff" }, i);
  }
  ctx.globalAlpha = a0;
}

// A pulse worn on the shape itself (slot "shape"): how strong it is now,
// 0..1 — full right on a trigger hit, dying away over `beats`. Null outside
// its window (from / until): there it does nothing and the shape shows plainly.
function flashNow(f, B) {
  const win = fxWindow(SCORE, f.from, f.until);
  if (!win || B < win[0] || B >= win[1]) return null;
  if (!f.on) return 0;
  let h = null;
  for (const x of momentHits(SCORE, f.on)) if (x >= win[0] && x <= B && (h == null || x > h)) h = x;
  const ph = h == null ? 1 : (B - h) / (f.beats || 1);
  return ph >= 1 ? 0 : smoothstep(1 - ph) * (f.amount ?? 0.35);
}

// The ripple effect: on each hit of its trigger a ring leaves the shape's rim
// and travels `distance` out (square units) over `beats`, fading as it goes;
// width is the ring's thickness, color a palette slot or a hex. Rings from
// hits close together overlap. Only inside its window (from / until).
function ripplesNow(f, B) {
  const win = fxWindow(SCORE, f.from, f.until), life = f.beats || 1;
  if (!win || !f.on || B < win[0] || B >= win[1]) return [];
  const out = [];
  for (const h of momentHits(SCORE, f.on)) {
    if (h < win[0] || h > B || B - h >= life) continue;
    out.push({ t: (B - h) / life, f });
  }
  return out;
}

// One ring, drawn in the spot's own frame (scale: the spot's size, so the
// distance and width stay in square units). It eases out as it travels.
function drawRing(sh, s, r, scale, ctx = drawingContext) {
  const f = r.f, b = sh.moves.box, half = (Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2) * sh.k;
  const ease = 1 - (1 - r.t) * (1 - r.t);
  const grow = 1 + ((f.distance ?? 0.12) * ease) / (scale * half);
  const c = f.color ?? "#000000", col = c.startsWith("#") ? c : slotColor(c, s.col);
  ctx.save();
  ctx.globalAlpha *= (1 - r.t) * (f.amount ?? 1);
  ctx.scale(grow, grow);
  ctx.scale(sh.k, sh.k);
  ctx.translate(-sh.cx, -sh.cy);
  ctx.strokeStyle = col;
  ctx.lineWidth = (f.width ?? 0.012) / (scale * grow * sh.k);
  ctx.lineJoin = "miter";
  for (const it of sh.items) ctx.stroke(it.path);
  ctx.restore();
}

// The follow effect: a property (height or size) set by the song's pitch or
// loudness, read in a window around each spot's hit when the spots step (a
// fill), or around the playhead when they don't. relative maps the lowest
// read in the set to min and the highest to max; absolute maps the value
// (0..1) itself. Height stretches from an anchor: the inner edge (facing
// the middle of the spot set), the center, the top or the bottom. Older
// scores' heightFrom / sizeFrom read as follows.
function followOf(P) {
  const f = P.fx?.find((x) => x.kind === "follow");
  if (f) return f;
  if (P.heightFrom === "pitch") return { source: "pitch", target: "height" };
  if (P.sizeFrom === "wave") return { source: "loudness", target: "size", min: 0.3, max: 1.2, mapping: "absolute" };
  return null;
}

function followScales(P, s, st, sh, cyc, f) {
  const dur = (typeof source !== "undefined" && source.durationMs) || Waveform.ms;
  const pitch = (f.source ?? "pitch") === "pitch";
  if (!dur || !Waveform.data || (pitch && !Waveform.pitch)) return null;
  const before = f.before ?? 0.1, after = f.after ?? 0.4;
  const read = (b) => {
    const fa = beatsToMs(SCORE, b - before) / dur, fb = beatsToMs(SCORE, b + after) / dur;
    return pitch ? Waveform.pitchNear(fa, fb) : Waveform.levelNear(fa, fb);
  };
  const beats = P.spotsMode === "turns" ? spotHitBeats(P, s, st, cyc) : null;
  const vals = P.spots.map((_, i) => (beats ? (beats[i] == null ? null : read(beats[i])) : read(s.B)));
  const lo0 = f.min ?? 0.45, hi0 = f.max ?? 1;
  let map = (v) => lo0 + (hi0 - lo0) * v;
  if ((f.mapping ?? "relative") === "relative" && beats) {
    const known = vals.filter((v) => v != null);
    if (!known.length) return null;
    const lo = Math.min(...known), span = Math.max(Math.max(...known) - lo, 0.04);
    map = (v) => lo0 + ((hi0 - lo0) * (v - lo)) / span;
  }
  const out = vals.map((v) => (v == null ? 1 : map(v)));
  const b = sh.moves.box, top = (b.y0 - sh.cy) * sh.k, bottom = (b.y1 - sh.cy) * sh.k;
  const mid = P.spots.reduce((a, sp) => a + sp[1], 0) / P.spots.length, anchor = f.anchor ?? "inner";
  out.anchor = P.spots.map((sp) => (anchor === "top" ? top : anchor === "bottom" ? bottom : anchor === "center" ? 0
    : sp[1] < mid - 1e-6 ? bottom : sp[1] > mid + 1e-6 ? top : 0));
  return out;
}

// moveOn as a step length in beats: "beat", "bar", or a number of beats
// (0.5 steps every half beat); null when it names a moment.
function stepBeats(P, s) {
  if (typeof P.moveOn === "number") return P.moveOn > 0 ? P.moveOn : null;
  return { beat: 1, bar: s.bpb }[P.moveOn] ?? null;
}

// How many times the spots have stepped since the layer came in, and when the
// last two steps landed. Steps come from `moveOn` (a moment's hits, or every
// beat / bar / that many beats, or the claps / bongos); `thenEvery` keeps
// stepping after the last hit ("stay", the default, stops there).
function spotStep(P, s, st) {
  const inAt = st.T?.inAt ?? 0;
  // `moveBars` ends the moving after that many bars; the copy stays where it is
  const Bc = P.moveBars ? Math.min(s.B, inAt + P.moveBars * s.bpb - 1e-6) : s.B;
  let n = 0, at = inAt, prevAt = inAt;
  const every = stepBeats(P, s);
  if (every) {
    // grid lines crossed since the clip came in: a clip that comes in off the
    // grid (on a tapped moment) still steps right on the grid
    const g0 = stepOrigin(inAt, every);
    n = Math.max(0, Math.floor(Bc / every + 1e-6) - g0);
    at = n ? (g0 + n) * every : inAt;
    prevAt = n > 1 ? (g0 + n - 1) * every : inAt;
  } else if (P.moveOn) {
    let hits = s.hits(P.moveOn, inAt + 1e-6, Bc);
    // switchUnder: only the quick taps move it — a hit counts when it lands
    // within that many beats of the hit before; the spaced-out ones hold still
    if (P.switchUnder) hits = hits.filter((h, i, all) => i > 0 && h[1] - all[i - 1][1] < P.switchUnder);
    n = hits.length;
    at = n ? hits[n - 1][1] : inAt;
    prevAt = n > 1 ? hits[n - 2][1] : inAt;
  }
  const then = { beat: 1, bar: s.bpb }[P.thenEvery];
  if (then && !every) {
    const first = (Math.floor(at / then + 1e-6) + 1) * then; // the next grid line after the last hit
    const extra = Bc >= first ? Math.floor((Bc - first) / then) + 1 : 0;
    if (extra > 0) {
      prevAt = extra === 1 ? at : first + (extra - 2) * then;
      at = first + (extra - 1) * then;
      n += extra;
    }
  }
  return { n, at, prevAt };
}

// One copy that moves to the next spot on each step: jumping, blinking across
// (shut here, open there) or sliding.
// Which spot the copy is at after its n-th move. spotOrder: "cycle" (around
// the list, the default), "bounce" (back and forth), "random" (anywhere but
// where it is — stable, the same every playback).
function spotIndex(P, len, n) {
  if (len < 2 || n <= 0) return 0;
  if (P.spotOrder === "bounce") { const m = n % (2 * len - 2); return m < len ? m : 2 * len - 2 - m; }
  if (P.spotOrder === "random") {
    let i = 0;
    for (let k = 1; k <= n; k++) i = (i + 1 + Math.floor(rnd01(k) * (len - 1))) % len;
    return i;
  }
  return n % len;
}

// A stable pseudo-random 0..1 per step, so "random" plays the same every time.
function rnd01(k) { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); }

function drawOneSpot(sh, P, s, st, step) {
  const spots = P.spots, i = spotIndex(P, spots.length, step.n), last = spotIndex(P, spots.length, step.n - 1);
  const how = P.switchBy ?? "jump", len = 0.35, since = s.B - step.at;
  let [x, y, size, flip = 1, deg = 0, skew = 0] = spots[i], squash = 1;
  if (step.n > 0 && since < len && how !== "jump") {
    const t = clamp01(since / len);
    if (how === "slide") {
      const k = smoothstep(t), [px, py, ps] = spots[last];
      x = px + (x - px) * k;
      y = py + (y - py) * k;
      size = ps + (size - ps) * k;
    } else if (t < 0.5) { // blink: shut at the old spot...
      [x, y, size, flip = 1, deg = 0, skew = 0] = spots[last];
      squash = Math.max(0.03, 1 - 2 * t);
    } else { // ...open at the new one
      squash = Math.max(0.03, 2 * t - 1);
    }
  }
  const frame = sh.motions.length ? motionFrame(sh.motions, sh.moves, s, st.age, i) : null;
  if (frame?.hidden) return;
  const sp = selfPulseNow(P, s.B);
  if (sp?.flashing && sp.w <= 0.001) return;
  const fx = fxNow(P, s, st);
  push();
  translate(x + fx.dx, y + fx.dy);
  if (deg || fx.rot) rotate((deg * Math.PI) / 180 + fx.rot);
  if (skew) shearX((-skew * Math.PI) / 180);
  scale(flip * size * P.size * fx.k, size * P.size * fx.k);
  if (squash !== 1) scale(1, squash);
  drawPainted(sh, s, P, i, frame, sp);
  pop();
}

// ---- Drawing -----------------------------------------------------------------

// Draws a shape centered on (0, 0), from -1 to 1 along its longer side,
// moved by a motion frame if it has one.
function drawShape(sh, col, ctx = drawingContext, frame = null) {
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.scale(sh.k, sh.k);
  ctx.translate(-sh.cx, -sh.cy);
  sh.items.forEach((it, i) => {
    const fx = frame ? itemFx(frame, it.parts, i, sh.items.length) : null;
    if (fx && fx.a <= 0.001) return;
    ctx.save();
    if (fx?.m) ctx.transform(fx.m.a, fx.m.b, fx.m.c, fx.m.d, fx.m.e, fx.m.f);
    const alpha = base * (fx?.a ?? 1);
    if (it.fill) {
      ctx.globalAlpha = alpha * it.fillA;
      ctx.fillStyle = it.fillSlot ? slotColor(it.fillSlot, col, it.fill) : it.fill;
      ctx.fill(it.path, it.rule);
    }
    if (it.stroke && it.width > 0) {
      ctx.globalAlpha = alpha * it.strokeA;
      ctx.strokeStyle = it.strokeSlot ? slotColor(it.strokeSlot, col, it.stroke) : it.stroke;
      ctx.lineWidth = it.width;
      ctx.lineCap = it.cap;
      ctx.lineJoin = it.join;
      ctx.stroke(it.path);
    }
    ctx.restore();
  });
  ctx.restore();
}

// The paint effect: the shape filled with its own color in place of the
// palette's. solid: the color itself. gradient: a soft field around it —
// the color pushed vivid and mid-toned underneath, then five blurred blobs with hues
// within ±spread degrees, drifting `drift` turns per bar. Each spot (seed)
// gets its own stable arrangement. color: a palette slot (it follows the
// palette and its pulses) or a hex color.
function paintShape(sh, s, f, seed, ctx = drawingContext) {
  const c = f.color ?? "ground", base = c.startsWith("#") ? c : slotColor(c, s.col);
  const gradient = (f.style ?? "gradient") === "gradient";
  let under = base, blobs = [];
  if (gradient) {
    const [h0, s0, l0] = chroma(base).hsl(), hue = Number.isNaN(h0) ? 0 : h0;
    // vivid and mid-toned: full color, lightness drawn toward the middle
    const vivid = Math.max(s0, 0.75), lc = 0.55 + (l0 - 0.55) * 0.35;
    under = chroma.hsl(hue, vivid, lc).hex();
    const b = sh.moves.box, w = b.x1 - b.x0, h = b.y1 - b.y0, t = (s.B / s.bpb) * (f.drift ?? 0.25) * 2 * Math.PI;
    for (let j = 0; j < 5; j++) {
      const r = (k) => rnd01(seed * 97 + j * 13 + k);
      blobs.push({
        x: b.x0 + w * (0.5 + 0.38 * Math.sin(t + r(1) * 2 * Math.PI)),
        y: b.y0 + h * (0.5 + 0.38 * Math.cos(t * 0.8 + r(2) * 2 * Math.PI)),
        rad: Math.max(w, h) * (0.45 + 0.4 * r(6)),
        col: chroma.hsl((hue + (f.spread ?? 20) * (2 * r(3) - 1) + 360) % 360,
          Math.min(1, vivid + 0.2 * (r(4) - 0.5)), Math.min(0.75, Math.max(0.3, lc + 0.16 * (r(5) - 0.5)))),
      });
    }
  }
  ctx.save();
  ctx.scale(sh.k, sh.k);
  ctx.translate(-sh.cx, -sh.cy);
  const b = sh.moves.box, w = b.x1 - b.x0, h = b.y1 - b.y0;
  for (const it of sh.items) {
    ctx.save();
    ctx.clip(it.path, it.rule);
    ctx.fillStyle = under;
    ctx.fillRect(b.x0, b.y0, w, h);
    for (const o of blobs) {
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.rad);
      g.addColorStop(0, o.col.alpha(0.9).css());
      g.addColorStop(1, o.col.alpha(0).css());
      ctx.fillStyle = g;
      ctx.fillRect(b.x0, b.y0, w, h);
    }
    ctx.restore();
  }
  ctx.restore();
}

// A palette slot's color right now: "ink", or "dreamy1" for the first dreamy tone.
function slotColor(slot, col, fallback = "#808080") {
  if (slot.startsWith("dreamy")) return col.dreamy[(Number(slot.slice(6)) - 1) % col.dreamy.length] ?? fallback;
  return col[slot] ?? fallback;
}

// ---- Loading -----------------------------------------------------------------

// Loads (or reloads) shapes/<name>.svg. Resolves true when something changed.
async function loadShape(name) {
  const sh = (SHAPES[name] ??= { status: "loading" });
  try {
    const res = await fetch(`shapes/${encodeURIComponent(name)}.svg`, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status === 404 ? `No shapes/${name}.svg yet` : `shapes/${name}.svg: error ${res.status}`);
    const text = await res.text();
    if (text === sh.text && sh.status === "ok") return false;
    Object.assign(sh, parseShape(text), { status: "ok", error: null, text });
  } catch (e) {
    if (sh.error === e.message) return false;
    sh.status = sh.items ? "ok" : "missing"; // a broken save keeps the last good drawing
    sh.error = e.message;
  }
  return true;
}

// Every shape the score uses.
function loadShapes() {
  const names = [...new Set(SCORE.layers.flatMap((R) => R.clips).filter((c) => c.shape).map((c) => c.shape))];
  return Promise.all(names.map(loadShape));
}

// Reads an SVG into paths the canvas can draw.
function parseShape(text) {
  return withSvg(text, (svg) => {
    const items = [], parts = [];
    for (const { el, chain, cs, fill, stroke } of svgElements(svg)) {
      const path = new Path2D();
      path.addPath(new Path2D(elementPathD(el)), chain.matrix);
      const m = chain.matrix, scaleW = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      items.push({
        path, parts: chain.parts, box: elementBox(el, chain.matrix),
        fill: fill?.hex, fillA: chain.opacity * parseFloat(cs.fillOpacity) * (fill?.a ?? 1), fillSlot: slotAttr(el, "fill"),
        rule: cs.fillRule === "evenodd" ? "evenodd" : "nonzero",
        stroke: stroke?.hex, strokeA: chain.opacity * parseFloat(cs.strokeOpacity) * (stroke?.a ?? 1), strokeSlot: slotAttr(el, "stroke"),
        width: parseFloat(cs.strokeWidth) * scaleW, cap: cs.strokeLinecap, join: cs.strokeLinejoin,
      });
      for (const p of chain.parts) if (!parts.includes(p)) parts.push(p);
    }
    const box = svgBox(svg), k = 2 / Math.max(box.width, box.height, 1e-6);
    // the boxes motions turn and scale around: the whole drawing, and each part
    const moves = { box: boxOf(items.map((it) => it.box)), parts: {}, half: 1 / k };
    for (const p of parts) moves.parts[p] = boxOf(items.filter((it) => it.parts.includes(p)).map((it) => it.box));
    return { items, parts, motions: readMotions(text), moves, cx: box.x + box.width / 2, cy: box.y + box.height / 2, k };
  });
}

// An element's bounds in the drawing's units.
function elementBox(el, m) {
  try {
    const b = el.getBBox(), pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
    const xs = pts.map(([x, y]) => m.a * x + m.c * y + m.e), ys = pts.map(([x, y]) => m.b * x + m.d * y + m.f);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  } catch { return null; }
}

function boxOf(boxes) {
  boxes = boxes.filter(Boolean);
  if (!boxes.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return {
    x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

// ---- Reading SVG -------------------------------------------------------------
// Shared with the Shapes tab, which reads the same files into editable lines.

// Runs fn on the SVG while it's in the page for a moment, hidden, so the browser
// works out its styles (classes, inherited colors) and transforms as it would show it.
function withSvg(text, fn) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.documentElement.localName !== "svg" || doc.querySelector("parsererror")) throw new Error("Not an SVG file");
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden";
  const svg = document.importNode(doc.documentElement, true);
  host.append(svg);
  document.body.append(host);
  try { return fn(svg); } finally { host.remove(); }
}

// The drawn elements, with their place in the drawing and their colors.
function svgElements(svg) {
  const out = [];
  for (const el of svg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon")) {
    const chain = ancestry(el, svg);
    if (!chain) continue; // inside defs, a clip path and so on, or hidden
    const cs = getComputedStyle(el);
    const fill = el.localName === "line" ? null : colorOf(cs.fill), stroke = colorOf(cs.stroke); // a line has no inside
    if (fill || stroke) out.push({ el, chain, cs, fill, stroke });
  }
  return out;
}

// The area a drawing covers: its viewBox, or its size, or what's drawn.
function svgBox(svg) {
  const vb = svg.viewBox.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return vb;
  if (svg.width.baseVal.value > 0 && svg.height.baseVal.value > 0) return { x: 0, y: 0, width: svg.width.baseVal.value, height: svg.height.baseVal.value };
  return svg.getBBox();
}

// data-fill-slot / data-stroke-slot (or data-slot for both), if it's a real slot.
function slotAttr(el, which) {
  const v = el.getAttribute(`data-${which}-slot`) || el.getAttribute("data-slot");
  return PAINT_SLOTS.includes(v) ? v : null;
}

// From an element up to the SVG: its transform, opacity and the named groups
// it sits in (outermost first). Null if it shouldn't be drawn.
const SKIP_INSIDE = new Set(["defs", "clippath", "mask", "symbol", "marker", "pattern"]);
function ancestry(el, svg) {
  let matrix = new DOMMatrix(), opacity = 1;
  const parts = [];
  for (let node = el; node && node !== svg; node = node.parentNode) {
    if (SKIP_INSIDE.has(node.localName.toLowerCase())) return null;
    const cs = getComputedStyle(node);
    if (cs.display === "none") return null;
    opacity *= parseFloat(cs.opacity);
    const t = node.transform?.baseVal?.consolidate();
    if (t) { const m = t.matrix; matrix = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]).multiply(matrix); }
    const name = node.localName === "g" && (node.getAttribute("data-name") || node.getAttribute("inkscape:label") || node.id);
    if (name) parts.unshift(name);
  }
  return { matrix, opacity, parts };
}

// A computed fill or stroke as { hex, a }, or null for none. Gradients and
// patterns come out grey.
function colorOf(value) {
  if (!value || value === "none") return null;
  if (value.startsWith("url(")) return { hex: "#808080", a: 1, gradient: true };
  try { const c = chroma(value); return { hex: c.hex("rgb"), a: c.alpha() }; } catch { return null; }
}
