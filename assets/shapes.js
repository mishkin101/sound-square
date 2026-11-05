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
// value of -1 mirrors the drawing there; a fifth turns it that many degrees.

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
    P.spots.forEach(([x, y, size, flip = 1, deg = 0], i) => {
      if (step && i > step.n) return; // take turns: spot i waits for the i-th hit
      const frame = sh.motions.length ? motionFrame(sh.motions, sh.moves, s, st.age, i) : null;
      if (frame?.hidden) return;
      push();
      translate(x + fx.dx, y + fx.dy);
      if (deg || fx.rot) rotate((deg * Math.PI) / 180 + fx.rot);
      scale(flip * size * P.size * fx.k, size * P.size * fx.k);
      drawShape(sh, s.col, drawingContext, frame);
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
const NO_FX = { dx: 0, dy: 0, rot: 0, k: 1 };

function fxNow(P, s, st) {
  if (!P.fx?.length) return NO_FX;
  let dx = 0, dy = 0, rot = 0, k = 1;
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
      amt = f.amount ?? (f.kind === "spin" ? 1 : 0.5);
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
    }
  }
  return { dx, dy, rot, k };
}

// How many times the spots have stepped since the layer came in, and when the
// last two steps landed. Steps come from `moveOn` (a moment's hits, or every
// beat / bar, or the claps / bongos); `thenEvery` keeps stepping after the last
// hit ("stay", the default, stops there).
function spotStep(P, s, st) {
  const inAt = st.T?.inAt ?? 0;
  // `moveBars` ends the moving after that many bars; the copy stays where it is
  const Bc = P.moveBars ? Math.min(s.B, inAt + P.moveBars * s.bpb - 1e-6) : s.B;
  let n = 0, at = inAt, prevAt = inAt;
  const every = { beat: 1, bar: s.bpb }[P.moveOn];
  if (every) {
    n = Math.max(0, Math.floor((Bc - inAt) / every));
    at = inAt + n * every;
    prevAt = inAt + Math.max(0, n - 1) * every;
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
  let [x, y, size, flip = 1, deg = 0] = spots[i], squash = 1;
  if (step.n > 0 && since < len && how !== "jump") {
    const t = clamp01(since / len);
    if (how === "slide") {
      const k = smoothstep(t), [px, py, ps] = spots[last];
      x = px + (x - px) * k;
      y = py + (y - py) * k;
      size = ps + (size - ps) * k;
    } else if (t < 0.5) { // blink: shut at the old spot...
      [x, y, size, flip = 1, deg = 0] = spots[last];
      squash = Math.max(0.03, 1 - 2 * t);
    } else { // ...open at the new one
      squash = Math.max(0.03, 2 * t - 1);
    }
  }
  const frame = sh.motions.length ? motionFrame(sh.motions, sh.moves, s, st.age, i) : null;
  if (frame?.hidden) return;
  const fx = fxNow(P, s, st);
  push();
  translate(x + fx.dx, y + fx.dy);
  if (deg || fx.rot) rotate((deg * Math.PI) / 180 + fx.rot);
  scale(flip * size * P.size * fx.k, size * P.size * fx.k);
  if (squash !== 1) scale(1, squash);
  drawShape(sh, s.col, drawingContext, frame);
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
