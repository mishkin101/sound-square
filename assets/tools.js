// sound-square Shapes tab: the Select, Points and shape tools, and redrawing with the pencil.
//
// Select (V): click a line to select it (Shift adds), or drag a box around
// lines. Drag the selection to move it (Shift keeps it level), a corner to
// scale it (Shift keeps its proportions), the knob above to turn it (Shift
// snaps to 15°). Arrow keys nudge, ⌘D duplicates, Delete removes.
//
// Shapes (R rectangle, O ellipse, L line, and arrow, polygon, star): drag
// from corner to corner. Shift keeps it even (a square, a circle, a 45° line),
// Alt draws from the middle out, a click makes one at a default size. They
// take the fill, line and weight set for new lines and shapes, and come out as
// ordinary paths, ready for Select and Points.
//
// Points (A), like a pen tool's direct selection: click a line to show its
// points. Drag points (Shift-click or drag a box for several), drag a handle to
// bend the curve; a smooth point keeps its handles in line unless you hold Alt.
// Double-click a point to switch it between smooth and corner, double-click the
// line to add a point. Delete removes points.

const ACCENT = "#2f6bff"; // selection marks, readable on any palette

// ---- Lines as subpaths ---------------------------------------------------------

// A pen line is one open subpath; a path has its own. Same nodes, so edits stick.
function subsOf(it) { return it.kind === "stroke" ? [{ nodes: it.nodes, closed: false }] : it.subs; }
function allItems() { return ED.doc.parts.flatMap((p) => p.items); }
function shownItems() { return ED.doc.parts.flatMap((p) => (p.hidden ? [] : p.items)); }
function partOf(it) { return ED.doc.parts.find((p) => p.items.includes(it)); }

function itemBox(it) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of subsOf(it)) {
    for (const [x, y] of sampleNodes(s.closed ? [...s.nodes, s.nodes[0]] : s.nodes, 8)) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const pad = it.kind === "stroke" ? it.size / 2 : it.stroke ? it.width / 2 : 0;
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function unionBox(items) {
  const bs = items.map(itemBox);
  return bs.length ? {
    x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)),
    x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)),
  } : null;
}

const overlaps = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
const rectOf = (a, b) => ({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) });

// An item's shape, to put back while dragging: every frame starts from where
// the drag began, so nothing drifts.
function geomOf(it) { return JSON.stringify(it.kind === "stroke" ? { nodes: it.nodes, size: it.size } : { subs: it.subs, width: it.width }); }
function restoreGeom(it, g) { Object.assign(it, JSON.parse(g)); touchItem(it); }

// Moves an item by a matrix; line widths grow and shrink with it by k.
function transformItem(it, m, k = 1) {
  for (const s of subsOf(it)) transformNodes(s.nodes, m);
  if (it.kind === "stroke") it.size = round1(Math.max(1, it.size * k));
  else it.width = round2(it.width * k);
  touchItem(it);
}

// One screen pixel in shape units, for sizes that should look the same at any zoom.
function edOne() { return 1 / ED.view.scale; }

// A drag only counts (and can be undone) once the pointer really moves.
function dragStarted(d, pt) {
  if (d.moved) return true;
  if (Math.hypot(pt[0] - d.start[0], pt[1] - d.start[1]) < 2 * edOne()) return false;
  d.moved = true;
  remember();
  return true;
}

// ---- Select ------------------------------------------------------------------

// The selection box's corners (scale) and the knob above it (turn).
function boxHandles(b) {
  const knob = 24 * edOne();
  return [
    { kind: "scale", x: b.x0, y: b.y0, ax: b.x1, ay: b.y1 }, { kind: "scale", x: b.x1, y: b.y0, ax: b.x0, ay: b.y1 },
    { kind: "scale", x: b.x1, y: b.y1, ax: b.x0, ay: b.y0 }, { kind: "scale", x: b.x0, y: b.y1, ax: b.x1, ay: b.y0 },
    { kind: "rotate", x: (b.x0 + b.x1) / 2, y: b.y0 - knob },
  ];
}

function selectDown(pt, e) {
  const box = unionBox(ED.sel), tol = 6 * edOne();
  const orig = () => new Map(ED.sel.map((it) => [it, geomOf(it)]));
  const handle = box && boxHandles(box).find((h) => Math.hypot(pt[0] - h.x, pt[1] - h.y) <= tol);
  if (handle) { ED.drag = { kind: handle.kind, handle, box, start: pt, orig: orig() }; return; }
  const hit = itemAt(ED.doc, pt[0], pt[1], tol);
  if (hit && e.shiftKey) {
    ED.sel = ED.sel.includes(hit.item) ? ED.sel.filter((it) => it !== hit.item) : [...ED.sel, hit.item];
    return;
  }
  if (hit && !ED.sel.includes(hit.item)) ED.sel = [hit.item];
  // a selection can be grabbed anywhere inside its box, so thin lines are easy to move
  if (hit || (box && pt[0] >= box.x0 && pt[0] <= box.x1 && pt[1] >= box.y0 && pt[1] <= box.y1)) {
    ED.drag = { kind: "move", start: pt, orig: orig() };
    return;
  }
  if (!e.shiftKey) ED.sel = [];
  ED.drag = { kind: "marquee", start: pt, now: pt };
}

function selectDrag(pt, e) {
  const d = ED.drag;
  if (d.kind === "marquee") { d.now = pt; return; }
  if (!dragStarted(d, pt)) return;
  let m, k = 1;
  if (d.kind === "move") {
    let dx = pt[0] - d.start[0], dy = pt[1] - d.start[1];
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    m = new DOMMatrix().translate(dx, dy);
  } else if (d.kind === "scale") {
    const { x, y, ax, ay } = d.handle, w = x - ax, h = y - ay;
    let sx = w ? (pt[0] - ax) / w : 1, sy = h ? (pt[1] - ay) / h : 1;
    if (e.shiftKey) sx = sy = ((pt[0] - ax) * w + (pt[1] - ay) * h) / (w * w + h * h || 1);
    sx = Math.abs(sx) < 0.02 ? 0.02 * Math.sign(sx || 1) : sx;
    sy = Math.abs(sy) < 0.02 ? 0.02 * Math.sign(sy || 1) : sy;
    m = new DOMMatrix().translate(ax, ay).scale(sx, sy).translate(-ax, -ay);
    k = Math.sqrt(Math.abs(sx * sy));
  } else {
    const cx = (d.box.x0 + d.box.x1) / 2, cy = (d.box.y0 + d.box.y1) / 2;
    let deg = ((Math.atan2(pt[1] - cy, pt[0] - cx) - Math.atan2(d.start[1] - cy, d.start[0] - cx)) * 180) / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    m = new DOMMatrix().translate(cx, cy).rotate(deg).translate(-cx, -cy);
  }
  for (const [it, g] of d.orig) { restoreGeom(it, g); transformItem(it, m, k); }
}

function selectUp() {
  const d = ED.drag;
  if (d.kind === "marquee") {
    const r = rectOf(d.start, d.now);
    for (const it of shownItems()) if (!ED.sel.includes(it) && overlaps(r, itemBox(it))) ED.sel.push(it);
  }
}

function moveSelection(dx, dy) {
  if (!ED.sel.length) return;
  remember();
  for (const it of ED.sel) transformItem(it, new DOMMatrix().translate(dx, dy));
}

function deleteSelection() {
  if (!ED.sel.length) return;
  remember();
  for (const p of ED.doc.parts) p.items = p.items.filter((it) => !ED.sel.includes(it));
  ED.sel = [];
}

// Copies sit a little down and right of the originals, in the same part, and become the selection.
function duplicateSelection() {
  if (!ED.sel.length) return;
  remember();
  ED.sel = ED.sel.map((it) => {
    const copy = JSON.parse(JSON.stringify(it)), part = partOf(it);
    transformItem(copy, new DOMMatrix().translate(20, 20));
    part.items.splice(part.items.indexOf(it) + 1, 0, copy);
    return copy;
  });
}

// The selection's fill, line and line weight. A pencil line always has its
// line, and can have a fill (the area it encloses). A path can have a fill, a
// line, or both. null (the "none" swatch) takes one away, and a color gives a
// line one it didn't have.
function setSelFill(slot) {
  if (!ED.sel.length) return;
  remember();
  for (const it of ED.sel) {
    if (!slot) { it.fill = it.fillSlot = null; continue; }
    if (!it.fill) { it.fill = slotColor(slot, edPalette()); it.fillA = 1; }
    it.fillSlot = slot;
  }
}

function setSelLine(slot) {
  remember();
  for (const it of ED.sel) {
    if (it.kind === "stroke") { if (slot) it.slot = slot; continue; } // a pencil line can't lose its line
    if (!slot) { it.stroke = it.strokeSlot = null; continue; }
    if (!it.stroke || !(it.width > 0)) {
      Object.assign(it, { stroke: slotColor(slot, edPalette()), strokeA: 1, width: it.width > 0 ? it.width : 8, cap: "round", join: "round" });
    }
    it.strokeSlot = slot;
  }
}

// A pencil line's pressure (how much it swells and thins with the pen) and pointed ends.
function setSelStroke(key, v) {
  for (const it of ED.sel) {
    if (it.kind !== "stroke") continue;
    it[key] = v;
    touchItem(it);
  }
}

// Smooths out the wobbles in the selected lines; each go smooths more.
function smoothSelection() {
  if (!ED.sel.length) return;
  remember();
  for (const it of ED.sel) {
    if (it.kind === "stroke") it.nodes = smoothNodes(it.nodes, false);
    else it.subs = it.subs.map((s) => ({ closed: s.closed, nodes: smoothNodes(s.nodes, s.closed).map(({ p, ...n }) => n) }));
    touchItem(it);
  }
}

function setSelWeight(w) {
  for (const it of ED.sel) {
    if (it.kind === "stroke") it.size = Math.max(1, w);
    else it.width = w;
    touchItem(it);
  }
}

// What the selection has now, for the panel: a slot name, "drawn" (a color as
// drawn), "none", or undefined when the lines differ.
function selProps() {
  const paths = ED.sel.filter((it) => it.kind === "path");
  const same = (vals) => (vals.length && vals.every((v) => v === vals[0]) ? vals[0] : undefined);
  const weights = ED.sel.map((it) => (it.kind === "stroke" ? it.size : it.width));
  return {
    paths: paths.length,
    fill: same(ED.sel.map((it) => (it.fill ? it.fillSlot ?? "drawn" : "none"))),
    line: same(ED.sel.map((it) => (it.kind === "stroke" ? it.slot : it.stroke && it.width > 0 ? it.strokeSlot ?? "drawn" : "none"))),
    weight: weights[0] ?? 0,
    strokes: ED.sel.filter((it) => it.kind === "stroke"),
  };
}

function moveSelectionToPart(i) {
  const to = ED.doc.parts[i];
  if (!to || !ED.sel.length) return;
  remember();
  for (const p of ED.doc.parts) p.items = p.items.filter((it) => !ED.sel.includes(it));
  to.items.push(...ED.sel);
}

// ---- Points ------------------------------------------------------------------

const nodeKey = (si, ni) => `${si}:${ni}`;

function eachNode(fn) {
  subsOf(ED.target).forEach((s, si) => s.nodes.forEach((n, ni) => fn(n, si, ni, s)));
}

function nodeAt(pt, tol) {
  let found = null, best = tol;
  eachNode((n, si, ni) => {
    const d = Math.hypot(pt[0] - n.x, pt[1] - n.y);
    if (d <= best) { best = d; found = { si, ni }; }
  });
  return found;
}

const extended = (n, w) => Math.hypot(n[w === "in" ? "ix" : "ox"] - n.x, n[w === "in" ? "iy" : "oy"] - n.y) > 0.5;

// The handles on show: those of the selected points and the ones facing them
// from their neighbors. An open line's ends have no handle pointing outward.
function shownHandles() {
  const out = [], seen = new Set();
  const add = (s, si, ni, w) => {
    const n = s.nodes[ni], k = `${si}:${ni}:${w}`;
    if (!n || seen.has(k) || !extended(n, w)) return;
    if (!s.closed && ((w === "in" && ni === 0) || (w === "out" && ni === s.nodes.length - 1))) return;
    seen.add(k);
    out.push({ si, ni, w, node: n, x: w === "in" ? n.ix : n.ox, y: w === "in" ? n.iy : n.oy });
  };
  subsOf(ED.target).forEach((s, si) => {
    const len = s.nodes.length, wrap = (i) => (s.closed ? (i + len) % len : i);
    s.nodes.forEach((_, ni) => {
      if (!ED.nodesSel.has(nodeKey(si, ni))) return;
      add(s, si, ni, "in"); add(s, si, ni, "out");
      add(s, si, wrap(ni - 1), "out"); add(s, si, wrap(ni + 1), "in");
    });
  });
  return out;
}

// Smooth: both handles out and pointing opposite ways.
function isSmooth(n) {
  if (!extended(n, "in") || !extended(n, "out")) return false;
  const ax = n.ix - n.x, ay = n.iy - n.y, bx = n.ox - n.x, by = n.oy - n.y;
  return (ax * bx + ay * by) < 0 && Math.abs(ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by)) < 0.1;
}

function pointsDown(pt, e) {
  const tol = 6 * edOne();
  if (ED.target) {
    // the nearest point or handle; a point wins a tie, since short handles sit on top of it
    const near = (x, y) => Math.hypot(pt[0] - x, pt[1] - y);
    const n = nodeAt(pt, tol), dn = n ? near(subsOf(ED.target)[n.si].nodes[n.ni].x, subsOf(ED.target)[n.si].nodes[n.ni].y) : Infinity;
    const h = shownHandles().filter((h) => near(h.x, h.y) <= tol).sort((a, b) => near(a.x, a.y) - near(b.x, b.y))[0];
    if (h && near(h.x, h.y) < dn) {
      ED.drag = { kind: "handle", si: h.si, ni: h.ni, w: h.w, smooth: isSmooth(h.node) && !e.altKey, start: pt, orig: geomOf(ED.target) };
      return;
    }
    if (n) {
      const k = nodeKey(n.si, n.ni);
      if (e.shiftKey) { ED.nodesSel.has(k) ? ED.nodesSel.delete(k) : ED.nodesSel.add(k); return; }
      if (!ED.nodesSel.has(k)) ED.nodesSel = new Set([k]);
      ED.drag = { kind: "nodes", start: pt, orig: geomOf(ED.target) };
      return;
    }
  }
  const hit = itemAt(ED.doc, pt[0], pt[1], tol);
  if (hit) {
    if (hit.item !== ED.target) { ED.target = hit.item; ED.nodesSel = new Set(); }
    else if (!e.shiftKey) ED.nodesSel = new Set();
    return;
  }
  ED.drag = { kind: "marquee", start: pt, now: pt, add: e.shiftKey };
}

function pointsDrag(pt, e) {
  const d = ED.drag, it = ED.target;
  if (d.kind === "marquee") { d.now = pt; return; }
  if (!dragStarted(d, pt)) return;
  restoreGeom(it, d.orig);
  const subs = subsOf(it);
  if (d.kind === "nodes") {
    let dx = pt[0] - d.start[0], dy = pt[1] - d.start[1];
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    eachNode((n, si, ni) => {
      if (!ED.nodesSel.has(nodeKey(si, ni))) return;
      n.x += dx; n.y += dy; n.ix += dx; n.iy += dy; n.ox += dx; n.oy += dy;
    });
  } else {
    const n = subs[d.si].nodes[d.ni], [hx, hy, ox, oy] = d.w === "in" ? ["ix", "iy", "ox", "oy"] : ["ox", "oy", "ix", "iy"];
    n[hx] = pt[0]; n[hy] = pt[1];
    if (d.smooth && !e.altKey) { // the other handle turns with it, keeping its length
      const len = Math.hypot(n[ox] - n.x, n[oy] - n.y), dx = pt[0] - n.x, dy = pt[1] - n.y, l = Math.hypot(dx, dy) || 1;
      n[ox] = n.x - (dx / l) * len; n[oy] = n.y - (dy / l) * len;
    }
  }
  touchItem(it);
}

function pointsUp() {
  const d = ED.drag;
  if (d.kind !== "marquee") return;
  if (!ED.target || Math.hypot(d.now[0] - d.start[0], d.now[1] - d.start[1]) < 2 * edOne()) {
    if (!d.add) { ED.target = null; ED.nodesSel = new Set(); } // a click on empty space lets go
    return;
  }
  const r = rectOf(d.start, d.now);
  if (!d.add) ED.nodesSel = new Set();
  eachNode((n, si, ni) => { if (n.x >= r.x0 && n.x <= r.x1 && n.y >= r.y0 && n.y <= r.y1) ED.nodesSel.add(nodeKey(si, ni)); });
}

// Double-click: on a point, smooth <-> corner; on the line, a new point there.
function pointsDouble(pt) {
  const tol = 6 * edOne();
  if (!ED.target) return;
  const n = nodeAt(pt, tol);
  if (n) {
    const s = subsOf(ED.target)[n.si], nd = s.nodes[n.ni];
    remember();
    if (extended(nd, "in") || extended(nd, "out")) {
      nd.ix = nd.ox = nd.x; nd.iy = nd.oy = nd.y; // corner
    } else {
      const len = s.nodes.length, at = (i) => s.nodes[s.closed ? (i + len) % len : Math.max(0, Math.min(len - 1, i))];
      const a = at(n.ni - 1), b = at(n.ni + 1), tx = (b.x - a.x) / 6, ty = (b.y - a.y) / 6;
      nd.ix = nd.x - tx; nd.iy = nd.y - ty; nd.ox = nd.x + tx; nd.oy = nd.y + ty;
    }
    touchItem(ED.target);
    return;
  }
  const seg = segmentAt(pt, tol);
  if (seg) {
    remember();
    splitSegment(seg);
    ED.nodesSel = new Set([nodeKey(seg.si, seg.ni + 1)]);
    touchItem(ED.target);
  }
}

// The closest place on the target's line to pt, as { si, ni, t } (the curve
// from node ni to the next, at t from 0 to 1), if within tol.
function segmentAt(pt, tol) {
  let best = null;
  subsOf(ED.target).forEach((s, si) => {
    const count = s.closed ? s.nodes.length : s.nodes.length - 1;
    for (let ni = 0; ni < count; ni++) {
      const a = s.nodes[ni], b = s.nodes[(ni + 1) % s.nodes.length];
      for (let j = 0; j <= 40; j++) {
        const [x, y] = bezierAt(a, b, j / 40), dist = Math.hypot(x - pt[0], y - pt[1]);
        if (dist <= tol && (!best || dist < best.dist)) best = { si, ni, t: j / 40, dist };
      }
    }
  });
  return best;
}

function bezierAt(a, b, t) {
  const u = 1 - t;
  return [
    u * u * u * a.x + 3 * u * u * t * a.ox + 3 * u * t * t * b.ix + t * t * t * b.x,
    u * u * u * a.y + 3 * u * u * t * a.oy + 3 * u * t * t * b.iy + t * t * t * b.y,
  ];
}

// Splits a curve in two at t without changing its shape.
function splitSegment({ si, ni, t }) { splitNodes(subsOf(ED.target)[si].nodes, ni, t); }

// Removes the selected points. A line left with too few points goes too.
function deletePoints() {
  if (!ED.target || !ED.nodesSel.size) return;
  remember();
  const it = ED.target;
  if (it.kind === "stroke") it.nodes = it.nodes.filter((_, ni) => !ED.nodesSel.has(nodeKey(0, ni)));
  else it.subs = it.subs.map((s, si) => ({ ...s, nodes: s.nodes.filter((_, ni) => !ED.nodesSel.has(nodeKey(si, ni))) })).filter((s) => s.nodes.length >= 2);
  ED.nodesSel = new Set();
  touchItem(it);
  if (it.kind === "stroke" ? !it.nodes.length : !it.subs.length) {
    const part = partOf(it);
    part.items.splice(part.items.indexOf(it), 1);
    ED.target = null;
  }
}

// Fewer points on the line being edited (the button in the Tools panel).
function fewerPoints() {
  const it = ED.target;
  if (!it) return;
  remember();
  if (it.kind === "stroke") it.nodes = fewerNodes(it.nodes, false);
  else it.subs = it.subs.map((s) => ({ closed: s.closed, nodes: fewerNodes(s.nodes, s.closed).map(({ p, ...n }) => n) }));
  ED.nodesSel = new Set();
  touchItem(it);
}

function nudgePoints(dx, dy) {
  if (!ED.target || !ED.nodesSel.size) return;
  remember();
  eachNode((n, si, ni) => {
    if (!ED.nodesSel.has(nodeKey(si, ni))) return;
    n.x += dx; n.y += dy; n.ix += dx; n.iy += dy; n.ox += dx; n.oy += dy;
  });
  touchItem(ED.target);
}

// ---- Redrawing with the pencil ------------------------------------------------
// A pencil line drawn over a line changes it instead of adding a new one:
//   from one place on a line to another place on it: that stretch is replaced
//   from either end of a pencil line: the line carries on
// Alt (or Redraw off) draws a separate line.

function redrawReach() { return Math.max(10, 8 * edOne()); }

// The closest place on a shown line (or on `only`) to pt, within reach:
// { item, si, ni, t, x, y, dist }.
function lineSpotAt(pt, only = null) {
  let best = null;
  const reach = redrawReach();
  for (const it of only ? [only] : shownItems()) {
    subsOf(it).forEach((s, si) => {
      const count = s.closed ? s.nodes.length : s.nodes.length - 1;
      for (let ni = 0; ni < count; ni++) {
        const a = s.nodes[ni], b = s.nodes[(ni + 1) % s.nodes.length];
        const len = Math.hypot(a.ox - a.x, a.oy - a.y) + Math.hypot(b.ix - a.ox, b.iy - a.oy) + Math.hypot(b.x - b.ix, b.y - b.iy);
        const steps = Math.max(8, Math.ceil(len / 2));
        for (let j = 0; j <= steps; j++) {
          const [x, y] = bezierAt(a, b, j / steps), dist = Math.hypot(x - pt[0], y - pt[1]);
          if (dist <= reach && (!best || dist < best.dist)) best = { item: it, si, ni, t: j / steps, x, y, dist };
        }
      }
    });
  }
  return best;
}

// Finishes a pencil line drawn from `start` (a lineSpotAt): true if it changed that line.
function redrawLine(pts, start) {
  if (!start || pts.length < 2) return false;
  const it = start.item, s = subsOf(it)[start.si], reach = redrawReach();
  const last = pts[pts.length - 1], end = lineSpotAt(last, it);
  if (end && end.si === start.si && Math.hypot(end.x - start.x, end.y - start.y) > 2 * reach) {
    replaceStretch(it, s, start, end, pts);
    return true;
  }
  if (it.kind !== "stroke") return false;
  const nodes = it.nodes, first = nodes[0], tail = nodes[nodes.length - 1];
  const near = (n) => Math.hypot(pts[0][0] - n.x, pts[0][1] - n.y) <= reach;
  if (near(tail)) { carryOn(nodes, pts, false); touchItem(it); return true; }
  if (near(first)) { carryOn(nodes, pts, true); touchItem(it); return true; }
  return false;
}

// The new points fitted into a curve that starts at node `from` and ends at `to`
// (either may be null: that end stays where it was drawn).
function fittedBetween(pts, from, to, keepP) {
  const q = simplify(pts, 2.5).map((p) => p.slice());
  if (q.length < 2) q.push(pts[pts.length - 1].slice());
  if (from) { q[0][0] = from.x; q[0][1] = from.y; }
  if (to) { q[q.length - 1][0] = to.x; q[q.length - 1][1] = to.y; }
  // pressure eases from the old line's at each join, so the width doesn't jump there
  const dp0 = from?.p != null ? from.p - q[0][2] : 0, dp1 = to?.p != null ? to.p - q[q.length - 1][2] : 0;
  q.forEach((p, i) => { const t = i / (q.length - 1); p[2] = round2(Math.max(0.05, Math.min(1, p[2] + dp0 * (1 - t) + dp1 * t))); });
  const nodes = fitCurve(q);
  return keepP ? nodes : nodes.map(({ p, ...n }) => n);
}

function replaceStretch(it, s, A, B, pts) {
  const nodes = s.nodes, n = nodes.length, pos = (sp) => sp.ni + sp.t;
  let from = A, to = B, line = pts;
  if (s.closed) {
    // two ways round between the ends: replace the one the new line was drawn along
    const mid = pts[pts.length >> 1], arcMid = (a, b) => {
      let pa = pos(a), pb = pos(b);
      if (pb < pa) pb += n;
      const m = ((pa + pb) / 2) % n, ni = Math.floor(m);
      return bezierAt(nodes[ni], nodes[(ni + 1) % n], m - ni);
    };
    const [fx, fy] = arcMid(A, B), [bx, by] = arcMid(B, A);
    if (Math.hypot(bx - mid[0], by - mid[1]) < Math.hypot(fx - mid[0], fy - mid[1])) { from = B; to = A; line = [...pts].reverse(); }
  } else if (pos(A) > pos(B)) {
    from = B; to = A; line = [...pts].reverse();
  }
  // split the line at both ends of the stretch, the later place first
  const later = pos(to) > pos(from) ? to : from, earlier = later === to ? from : to;
  const at = (sp, t = sp.t) => {
    if (t < 1e-3) return { i: sp.ni, added: false };
    if (t > 1 - 1e-3) return { i: (sp.ni + 1) % nodes.length, added: false };
    splitNodes(nodes, sp.ni, t);
    return { i: sp.ni + 1, added: true };
  };
  const hi = at(later);
  const lo = at(earlier, earlier.ni === later.ni && hi.added ? earlier.t / later.t : earlier.t);
  if (lo.added && lo.i <= hi.i) hi.i++;
  const iFrom = later === from ? hi.i : lo.i, iTo = later === to ? hi.i : lo.i;
  const F = nodes[iFrom], T = nodes[iTo], fit = fittedBetween(line, F, T, it.kind === "stroke");
  F.ox = fit[0].ox; F.oy = fit[0].oy;
  T.ix = fit[fit.length - 1].ix; T.iy = fit[fit.length - 1].iy;
  const inner = fit.slice(1, -1);
  let out;
  if (!s.closed) out = [...nodes.slice(0, iFrom + 1), ...inner, ...nodes.slice(iTo)];
  else { // keep the way round from T back to F, then the new stretch
    const kept = [];
    for (let i = iTo; ; i = (i + 1) % nodes.length) { kept.push(nodes[i]); if (i === iFrom) break; }
    out = [...kept, ...inner];
  }
  nodes.splice(0, nodes.length, ...out);
  touchItem(it);
}

// A pencil line drawn on from one of its ends.
function carryOn(nodes, pts, atStart) {
  if (atStart) {
    const end = nodes[0], fit = fittedBetween([...pts].reverse(), null, end, true);
    end.ix = fit[fit.length - 1].ix; end.iy = fit[fit.length - 1].iy;
    nodes.unshift(...fit.slice(0, -1));
  } else {
    const end = nodes[nodes.length - 1], fit = fittedBetween(pts, end, null, true);
    end.ox = fit[0].ox; end.oy = fit[0].oy;
    nodes.push(...fit.slice(1));
  }
}

// ---- Shapes ------------------------------------------------------------------

const SHAPE_TOOLS = { rect: "rectangle", ellipse: "ellipse", line: "line", arrow: "arrow", polygon: "polygon", star: "star" };
const OPEN_SHAPES = new Set(["line", "arrow"]);

// Path data for a shape drawn from corner a to corner b.
function shapeD(kind, [ax, ay], [bx, by]) {
  const x0 = Math.min(ax, bx), y0 = Math.min(ay, by), w = Math.abs(bx - ax), h = Math.abs(by - ay);
  const cx = x0 + w / 2, cy = y0 + h / 2, o = ED.toolOpts;
  const ring = (n, inner) => Array.from({ length: n }, (_, i) => {
    const t = -Math.PI / 2 + (i * 2 * Math.PI) / n, k = inner && i % 2 ? o.inner : 1;
    return `${i ? "L" : "M"}${cx + Math.cos(t) * (w / 2) * k},${cy + Math.sin(t) * (h / 2) * k}`;
  }).join("") + "Z";
  switch (kind) {
    case "rect": {
      const r = Math.min(o.corners, w / 2, h / 2);
      if (!r) return `M${x0},${y0}H${x0 + w}V${y0 + h}H${x0}Z`;
      return `M${x0 + r},${y0}H${x0 + w - r}A${r},${r} 0 0 1 ${x0 + w},${y0 + r}V${y0 + h - r}A${r},${r} 0 0 1 ${x0 + w - r},${y0 + h}` +
        `H${x0 + r}A${r},${r} 0 0 1 ${x0},${y0 + h - r}V${y0 + r}A${r},${r} 0 0 1 ${x0 + r},${y0}Z`;
    }
    case "ellipse": return `M${x0},${cy}A${w / 2},${h / 2} 0 1 0 ${x0 + w},${cy}A${w / 2},${h / 2} 0 1 0 ${x0},${cy}Z`;
    case "line": return `M${ax},${ay}L${bx},${by}`;
    case "arrow": { // the head grows with the line weight and the length
      const len = Math.hypot(bx - ax, by - ay) || 1, head = Math.min(len * 0.4, Math.max(30, ED.size * 3)), t = Math.atan2(by - ay, bx - ax);
      const wing = (s) => `${bx - head * Math.cos(t + s * 0.5)},${by - head * Math.sin(t + s * 0.5)}`;
      return `M${ax},${ay}L${bx},${by}M${wing(1)}L${bx},${by}L${wing(-1)}`;
    }
    case "polygon": return ring(o.sides, false);
    case "star": return ring(o.points * 2, true);
  }
}

// A shape as an item, in the colors and weight set for new things. A shape
// with neither a fill nor a line gets an ink line, so it can be seen.
function shapeItem(kind, a, b) {
  const col = edPalette(), open = OPEN_SHAPES.has(kind);
  const fillSlot = open ? null : ED.fillSlot, lineSlot = ED.slot ?? (open || !fillSlot ? "ink" : null);
  return {
    kind: "path", subs: parsePathD(shapeD(kind, a, b)),
    fill: fillSlot ? slotColor(fillSlot, col) : null, fillA: 1, fillSlot,
    stroke: lineSlot ? slotColor(lineSlot, col) : null, strokeA: 1, strokeSlot: lineSlot,
    width: ED.size, rule: "nonzero", cap: "round", join: kind === "ellipse" ? "round" : "miter",
  };
}

// Where the drag puts the two corners, with Shift (even) and Alt (from the middle).
function shapeCorners(d) {
  let [ax, ay] = d.start, [bx, by] = d.now;
  if (d.shift) {
    if (OPEN_SHAPES.has(ED.tool)) { // snap to 45°
      const t = Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(bx - ax, by - ay);
      bx = ax + Math.cos(t) * len; by = ay + Math.sin(t) * len;
    } else {
      const side = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      bx = ax + Math.sign(bx - ax || 1) * side; by = ay + Math.sign(by - ay || 1) * side;
    }
  }
  if (d.alt && !OPEN_SHAPES.has(ED.tool)) return [[2 * ax - bx, 2 * ay - by], [bx, by]];
  return [[ax, ay], [bx, by]];
}

function shapeDown(pt, e) { ED.drag = { kind: "shape", start: pt, now: pt, shift: e.shiftKey, alt: e.altKey }; }
function shapeDrag(pt, e) { Object.assign(ED.drag, { now: pt, shift: e.shiftKey, alt: e.altKey }); }

// Adds the shape (a click makes a default-size one) and selects it.
function shapeUp() {
  const d = ED.drag;
  let [a, b] = shapeCorners(d);
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 4 * edOne()) {
    const [x, y] = d.start;
    [a, b] = OPEN_SHAPES.has(ED.tool) ? [[x - 100, y], [x + 100, y]] : [[x - 100, y - 100], [x + 100, y + 100]];
  }
  const it = shapeItem(ED.tool, a, b);
  remember();
  ED.doc.parts[ED.part].hidden = false; // drawing into a hidden part shows it
  ED.doc.parts[ED.part].items.push(it);
  ED.drag = null;
  setTool("select");
  ED.sel = [it];
}

// ---- Showing them --------------------------------------------------------------

function drawToolMarks(ctx) {
  const one = edOne(), d = ED.drag;
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = one;
  // the line under the pointer, before it's picked
  if (!d && ED.hover && (ED.tool === "select" || ED.tool === "points")) {
    const hit = itemAt(ED.doc, ED.hover[0], ED.hover[1], 6 * one);
    if (hit && !ED.sel.includes(hit.item) && hit.item !== ED.target) ctx.stroke(itemPath(hit.item));
  }
  if (ED.tool === "select" && ED.sel.length) {
    for (const it of ED.sel) ctx.stroke(itemPath(it));
    const b = unionBox(ED.sel), hs = boxHandles(b), knob = hs[4];
    ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.beginPath(); ctx.moveTo(knob.x, b.y0); ctx.lineTo(knob.x, knob.y); ctx.stroke();
    ctx.fillStyle = "#fff";
    for (const h of hs.slice(0, 4)) { ctx.fillRect(h.x - 4 * one, h.y - 4 * one, 8 * one, 8 * one); ctx.strokeRect(h.x - 4 * one, h.y - 4 * one, 8 * one, 8 * one); }
    ctx.beginPath(); ctx.arc(knob.x, knob.y, 4 * one, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  if (ED.tool === "points" && ED.target) {
    ctx.stroke(new Path2D(subsToD(subsOf(ED.target))));
    for (const h of shownHandles()) {
      ctx.beginPath(); ctx.moveTo(h.node.x, h.node.y); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.beginPath(); ctx.arc(h.x, h.y, 3.5 * one, 0, 2 * Math.PI); ctx.fill();
    }
    eachNode((n, si, ni) => {
      const on = ED.nodesSel.has(nodeKey(si, ni));
      ctx.fillStyle = on ? ACCENT : "#fff";
      ctx.fillRect(n.x - 3.5 * one, n.y - 3.5 * one, 7 * one, 7 * one);
      ctx.strokeRect(n.x - 3.5 * one, n.y - 3.5 * one, 7 * one, 7 * one);
    });
  }
  if (d?.kind === "shape") {
    ctx.save();
    drawItem(ctx, shapeItem(ED.tool, ...shapeCorners(d)), edPalette());
    ctx.restore();
  }
  if (d?.kind === "marquee") {
    const r = rectOf(d.start, d.now);
    ctx.fillStyle = "rgba(47,107,255,0.08)";
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.setLineDash([4 * one, 3 * one]);
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }
  ctx.restore();
}

// What the pointer would do here, as a cursor.
function toolCursor(pt) {
  if (SHAPE_TOOLS[ED.tool]) return "crosshair";
  if (ED.tool === "photo") return ED.photo && !ED.photo.hidden ? (ED.drag ? "grabbing" : "move") : "default";
  if (!pt) return "default";
  const tol = 6 * edOne();
  if (ED.drag) return ED.drag.kind === "marquee" ? "crosshair" : ED.drag.kind === "rotate" ? "grabbing" : "move";
  if (ED.tool === "select") {
    const b = unionBox(ED.sel), h = b && boxHandles(b).find((h) => Math.hypot(pt[0] - h.x, pt[1] - h.y) <= tol);
    if (h) return h.kind === "rotate" ? "grab" : (h.x === b.x0) === (h.y === b.y0) ? "nwse-resize" : "nesw-resize";
    if (itemAt(ED.doc, pt[0], pt[1], tol) || (b && pt[0] >= b.x0 && pt[0] <= b.x1 && pt[1] >= b.y0 && pt[1] <= b.y1)) return "move";
    return "default";
  }
  if (ED.target && (shownHandles().some((h) => Math.hypot(pt[0] - h.x, pt[1] - h.y) <= tol) || nodeAt(pt, tol))) return "move";
  return itemAt(ED.doc, pt[0], pt[1], tol) ? "pointer" : "default";
}
