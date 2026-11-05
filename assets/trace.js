// sound-square Shapes tab: tracing paper sketches.
//
// A photo of a sketch sits under the drawing (Photo tool, P): move it, size it,
// turn it straight, and trace over it with the pencil. Only the part inside the
// shape's box counts, so placing the photo is also how you crop it.
//
// Auto-trace reads the pencil marks inside the box and turns them into lines
// you can edit:
//   lines:  a pencil line down the middle of each mark, as wide as the mark
//           (thinner where the mark is thinner)
//   shapes: the outline of each mark as a filled shape, for shading and blobs
// "Sensitivity" sets how faint a mark can be and still count; "ignore specks"
// drops dots of paper grain. With the Photo tool on, what will be traced shows
// in blue over the photo.
//
// The photo isn't saved in the shape. The studio keeps the last one (in this
// browser) so it's there for the next shape and after a reload.

const TRACE_N = 512; // the box is read at this many pixels across

// ---- The photo -------------------------------------------------------------------

// Reads an image file and fits it into the box, keeping any placement it had.
async function loadPhoto(blob, place = null) {
  const img = await createImageBitmap(blob);
  const fitW = DOC_UNITS * Math.min(1, img.width / img.height); // the whole photo fits in the box
  ED.photo = { img, blob, x: 500, y: 500, w: fitW, rot: 0, alpha: 0.6, hidden: false, ...place };
  ED.traceView = null;
  keepPhoto();
}

function keepPhoto() {
  const p = ED.photo;
  handleStore("put", "photo", p ? { blob: p.blob, x: p.x, y: p.y, w: p.w, rot: p.rot, alpha: p.alpha, hidden: p.hidden } : null);
}

// The last photo, from an earlier visit.
async function restorePhoto() {
  const kept = await handleStore("get", "photo");
  if (!kept?.blob) return;
  try { const { blob, ...place } = kept; await loadPhoto(blob, place); edUI(); renderEditor(); } catch {}
}

function fitPhoto() {
  const p = ED.photo;
  Object.assign(p, { x: 500, y: 500, w: DOC_UNITS * Math.min(1, p.img.width / p.img.height), rot: 0 });
}

// Photo pixels -> shape units.
function photoMatrix(p = ED.photo) {
  const k = p.w / p.img.width;
  return new DOMMatrix().translate(p.x, p.y).rotate(p.rot).scale(k).translate(-p.img.width / 2, -p.img.height / 2);
}

// Under the drawing: the photo in the box, and with the Photo tool, the rest of it
// faintly and what auto-trace will pick up in blue.
function drawPhoto(ctx) {
  const p = ED.photo;
  if (!p || p.hidden) return;
  const m = photoMatrix(), photoTool = ED.tool === "photo" && ED.mode === "draw";
  const paint = (alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(p.img, 0, 0);
    ctx.restore();
  };
  if (photoTool) paint(p.alpha * 0.3);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, DOC_UNITS, DOC_UNITS);
  ctx.clip();
  paint(p.alpha);
  if (photoTool && ED.traceOpts.show && !ED.drag) {
    const view = traceView();
    if (view) ctx.drawImage(view, 0, 0, DOC_UNITS, DOC_UNITS);
  }
  ctx.restore();
}

// The marks auto-trace would pick up, in blue, made again only when something changed.
function traceView() {
  const p = ED.photo, o = ED.traceOpts, key = [p.x, p.y, p.w, p.rot, o.sensitivity, o.specks].join();
  if (ED.traceView?.key === key) return ED.traceView.canvas;
  const { mask } = readMarks();
  const cv = ED.traceView?.canvas ?? document.createElement("canvas");
  cv.width = cv.height = TRACE_N;
  const g = cv.getContext("2d"), img = g.createImageData(TRACE_N, TRACE_N);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    img.data.set([47, 107, 255, 220], i * 4);
  }
  g.putImageData(img, 0, 0);
  ED.traceView = { key, canvas: cv };
  return cv;
}

// ---- Reading the marks -----------------------------------------------------------

// The photo inside the box as `dark` (0-1: how much darker than the paper around
// it each pixel is) and `mask` (the pixels that count as marks, specks dropped).
function readMarks() {
  const N = TRACE_N, o = ED.traceOpts;
  const cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff";
  g.fillRect(0, 0, N, N);
  const m = new DOMMatrix().scale(N / DOC_UNITS).multiply(photoMatrix());
  g.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  g.drawImage(ED.photo.img, 0, 0);
  const px = g.getImageData(0, 0, N, N).data, grey = new Float32Array(N * N);
  for (let i = 0; i < grey.length; i++) grey[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  // the paper: the brightest nearby (which wipes out thin lines), smoothed, so
  // shadows and uneven light across the photo don't count as marks
  const paper = boxBlur(maxFilter(grey, N, Math.round(N / 40)), N, Math.round(N / 24));
  let dark = new Float32Array(N * N);
  for (let i = 0; i < dark.length; i++) dark[i] = Math.max(0, (paper[i] - grey[i]) / Math.max(paper[i], 0.02));
  dark = boxBlur(dark, N, 1);
  const thr = 0.3 * Math.pow(1 - o.sensitivity / 100, 1.5) + 0.015;
  const mask = new Uint8Array(N * N);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) mask[y * N + x] = dark[y * N + x] >= thr ? 1 : 0;
  dropSpecks(mask, N, o.specks);
  for (let i = 0; i < dark.length; i++) if (!mask[i]) dark[i] = Math.min(dark[i], thr * 0.99); // specks stay out of outlines too
  return { N, dark, mask, thr };
}

// Each pixel as the brightest within r (a square), in two passes.
function maxFilter(a, N, r) {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(N - 1, x + r); k++) v = Math.max(v, a[y * N + k]);
    tmp[y * N + x] = v;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(N - 1, y + r); k++) v = Math.max(v, tmp[k * N + x]);
    out[y * N + x] = v;
  }
  return out;
}

// The average over a (2r+1) square around each pixel, from running sums.
function boxBlur(a, N, r) {
  const S = new Float64Array((N + 1) * (N + 1));
  for (let y = 0; y < N; y++) {
    let row = 0;
    for (let x = 0; x < N; x++) { row += a[y * N + x]; S[(y + 1) * (N + 1) + x + 1] = S[y * (N + 1) + x + 1] + row; }
  }
  const out = new Float32Array(a.length);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(N, x + r + 1), y1 = Math.min(N, y + r + 1);
    out[y * N + x] = (S[y1 * (N + 1) + x1] - S[y0 * (N + 1) + x1] - S[y1 * (N + 1) + x0] + S[y0 * (N + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return out;
}

// Clears groups of touching mark pixels smaller than `min` pixels.
function dropSpecks(mask, N, min) {
  if (min <= 1) return;
  const seen = new Uint8Array(mask.length), stack = [], group = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    stack.push(i); seen[i] = 1; group.length = 0;
    while (stack.length) {
      const j = stack.pop();
      group.push(j);
      for (const d of [-1, 1, -N, N, -N - 1, -N + 1, N - 1, N + 1]) {
        const k = j + d;
        if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (group.length < min) for (const j of group) mask[j] = 0;
  }
}

// ---- Lines: down the middle of each mark --------------------------------------------

const NX = [0, 1, 1, 1, 0, -1, -1, -1], NY = [-1, -1, 0, 1, 1, 1, 0, -1]; // around a pixel, from above, clockwise

// Thins marks to one pixel wide, keeping their shape (Zhang-Suen).
function thin(mask, N) {
  const sk = mask.slice(), off = NX.map((dx, k) => NY[k] * N + dx), del = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      del.length = 0;
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        if (!sk[i]) continue;
        const v = off.map((d) => sk[i + d]);
        const b = v.reduce((s, q) => s + q, 0);
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let k = 0; k < 8; k++) if (!v[k] && v[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        // v: 0 above, 2 right, 4 below, 6 left
        if (pass === 0 ? v[0] * v[2] * v[4] || v[2] * v[4] * v[6] : v[0] * v[2] * v[6] || v[0] * v[4] * v[6]) continue;
        del.push(i);
      }
      for (const i of del) sk[i] = 0;
      if (del.length) changed = true;
    }
  }
  return sk;
}

// How far each mark pixel is from the paper, in pixels (chamfer 3-4).
function distanceIn(mask, N) {
  const d = new Float32Array(mask.length);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  const pass = (ys, xs, nb) => {
    for (const y of ys) for (const x of xs) {
      const i = y * N + x;
      if (!d[i]) continue;
      for (const [dx, dy, c] of nb) d[i] = Math.min(d[i], d[(y + dy) * N + x + dx] + c);
    }
  };
  const inner = Array.from({ length: N - 2 }, (_, i) => i + 1);
  pass(inner, inner, [[-1, 0, 3], [0, -1, 3], [-1, -1, 4], [1, -1, 4]]);
  pass(inner.slice().reverse(), inner.slice().reverse(), [[1, 0, 3], [0, 1, 3], [1, 1, 4], [-1, 1, 4]]);
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

// The thinned marks as chains of pixels, end to end. Lines run on through
// crossings where they can, which keeps them long.
function chains(sk, N) {
  const off = NX.map((dx, k) => NY[k] * N + dx), order = [0, 2, 4, 6, 1, 3, 5, 7];
  const kind = new Uint8Array(sk.length); // 1 end, 2 middle, 3 crossing
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i]) continue;
    let cn = 0, count = 0;
    for (let k = 0; k < 8; k++) { count += sk[i + off[k]]; if (!sk[i + off[k]] && sk[i + off[(k + 1) % 8]]) cn++; }
    kind[i] = count === 0 ? 0 : cn <= 1 ? 1 : cn === 2 ? 2 : 3;
  }
  const seen = new Uint8Array(sk.length), out = [];
  const step = (cur, prev) => {
    let cross = -1;
    for (const k of order) {
      const n = cur + off[k];
      if (!kind[n] || n === prev) continue;
      if (kind[n] === 3) { if (cross < 0) cross = n; continue; }
      if (!seen[n]) return n;
    }
    return cross;
  };
  const walk = (start, prev) => {
    const path = prev >= 0 ? [prev] : [];
    for (let cur = start; cur >= 0;) {
      path.push(cur);
      if (kind[cur] === 3 && path.length > 1) break;
      seen[cur] = 1;
      const next = step(cur, path.length > 1 ? path[path.length - 2] : prev);
      if (next >= 0 && seen[next] && kind[next] !== 3) break;
      cur = next;
    }
    return path;
  };
  for (let i = 0; i < sk.length; i++) if (kind[i] === 1 && !seen[i]) out.push({ px: walk(i, -1) });
  for (let i = 0; i < sk.length; i++) {
    if (kind[i] !== 3) continue;
    for (const d of off) { const n = i + d; if (kind[n] && kind[n] !== 3 && !seen[n]) out.push({ px: walk(n, i), cross: true }); }
  }
  // what's left are loops: walk one way round, and close it if it comes back
  for (let i = 0; i < sk.length; i++) {
    if (kind[i] !== 2 || seen[i]) continue;
    const px = walk(i, -1), last = px[px.length - 1];
    const closed = px.length > 3 && off.some((d) => last + d === i);
    out.push({ px, closed });
  }
  return out;
}

function traceLines() {
  const { N, mask } = readMarks(), sk = thin(mask, N), dist = distanceIn(mask, N), unit = DOC_UNITS / N;
  const taper = ED.toolOpts.taper || 0.6, items = [];
  for (const c of chains(sk, N)) {
    const r = c.px.map((i) => Math.max(0.5, dist[i] - 0.5)), mid = [...r].sort((a, b) => a - b)[r.length >> 1];
    // little spurs where thinning frays a thick mark's corners
    if (c.px.length < 4 || (c.cross && c.px.length < 2.5 * mid + 2)) continue;
    let pts = c.px.map((i, j) => {
      const ratio = Math.min(1.6, r[j] / mid);
      return [((i % N) + 0.5) * unit, (Math.floor(i / N) + 0.5) * unit, Math.max(0.05, Math.min(1, 0.5 - (0.5 - 0.5 * ratio) / taper))];
    });
    pts = smoothPoints(smoothPoints(pts));
    if (c.closed) { pts = simplifyLoop(pts, 2.5); pts.push([...pts[0]]); } // a pencil line has ends: a loop's meet
    else pts = simplify(pts, 2.5);
    const nodes = fitCurve(pts.map(([x, y, p]) => [round1(x), round1(y), round2(p)]));
    items.push({ kind: "stroke", nodes, size: round1(Math.max(2, 2 * mid * unit)), taper, ends: 0, slot: ED.slot ?? "ink" });
  }
  return items;
}

// Each point moved halfway toward the average of its neighbors; the ends stay.
function smoothPoints(pts) {
  return pts.map((q, i) => (i === 0 || i === pts.length - 1 ? q : q.map((v, k) => (pts[i - 1][k] + 2 * v + pts[i + 1][k]) / 4)));
}

// ---- Shapes: the outline of each mark ---------------------------------------------

// Outlines where `dark` crosses the threshold (marching squares), as closed
// loops of points in pixels. The box's edge counts as paper, so every loop closes.
function outlines(dark, N, thr) {
  const at = (x, y) => dark[y * N + x] >= thr;
  const H = (x, y) => 2 * (y * N + x), V = (x, y) => 2 * (y * N + x) + 1;
  const link = new Int32Array(2 * N * N * 2).fill(-1);
  const join = (a, b) => { link[2 * a + (link[2 * a] < 0 ? 0 : 1)] = b; link[2 * b + (link[2 * b] < 0 ? 0 : 1)] = a; };
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
    const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
    const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
    if (c === 0 || c === 15) continue;
    const T = H(x, y), B = H(x, y + 1), L = V(x, y), R = V(x + 1, y);
    const mid = (dark[y * N + x] + dark[y * N + x + 1] + dark[(y + 1) * N + x] + dark[(y + 1) * N + x + 1]) / 4 >= thr;
    switch (c) {
      case 1: case 14: join(L, B); break;
      case 2: case 13: join(B, R); break;
      case 3: case 12: join(L, R); break;
      case 4: case 11: join(T, R); break;
      case 6: case 9: join(T, B); break;
      case 7: case 8: join(L, T); break;
      case 5: if (mid) { join(L, T); join(B, R); } else { join(L, B); join(T, R); } break;
      case 10: if (mid) { join(T, R); join(L, B); } else { join(L, T); join(B, R); } break;
    }
  }
  // where an edge's ends straddle the threshold
  const point = (e) => {
    const i = e >> 1, x = i % N, y = Math.floor(i / N), [x2, y2] = e & 1 ? [x, y + 1] : [x + 1, y];
    const a = dark[y * N + x], b = dark[y2 * N + x2], t = Math.max(0, Math.min(1, (thr - a) / (b - a || 1e-9)));
    return [x + (x2 - x) * t + 0.5, y + (y2 - y) * t + 0.5];
  };
  const used = new Uint8Array(2 * N * N), loops = [];
  for (let e = 0; e < used.length; e++) {
    if (used[e] || link[2 * e] < 0) continue;
    const loop = [];
    for (let cur = e, prev = -1; cur >= 0 && !used[cur];) {
      used[cur] = 1;
      loop.push(point(cur));
      const next = link[2 * cur] !== prev ? link[2 * cur] : link[2 * cur + 1];
      prev = cur; cur = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function loopArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return Math.abs(a / 2);
}

function insideLoop([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// One filled shape per mark, with its holes (the paper showing through) cut out.
function traceShapes() {
  const { N, dark, thr } = readMarks(), unit = DOC_UNITS / N;
  const loops = outlines(dark, N, thr).map((pts) => {
    const u = pts.map(([x, y]) => [x * unit, y * unit]);
    const xs = u.map((q) => q[0]), ys = u.map((q) => q[1]);
    return { pts: u, area: loopArea(u), box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
  }).filter((l) => l.area > 4 * unit * unit);
  // a loop inside an even number of others is a mark's edge; inside an odd number, a hole in one
  for (const l of loops) {
    l.around = loops.filter((o) => o !== l && o.area > l.area && overlaps(o.box, l.box) && insideLoop(l.pts[0], o.pts));
    l.hole = l.around.length % 2 === 1;
  }
  const col = edPalette(), slot = ED.fillSlot ?? ED.slot ?? "ink", items = new Map();
  for (const l of loops.filter((l) => !l.hole)) {
    items.set(l, {
      kind: "path", subs: [],
      fill: slotColor(slot, col), fillA: 1, fillSlot: slot, stroke: null, strokeA: 1, strokeSlot: null,
      width: 0, rule: "evenodd", cap: "round", join: "round",
    });
  }
  for (const l of loops) {
    const owner = l.hole ? l.around.reduce((a, b) => (a && a.area < b.area ? a : b), null) : l;
    const it = items.get(owner?.hole ? null : owner);
    if (!it) continue;
    const pts = simplifyLoop(l.pts, 1.5);
    if (pts.length < 3) continue;
    it.subs.push({ nodes: fitCurve(pts.map(([x, y]) => [round1(x), round1(y)]), true).map(({ p, ...n }) => n), closed: true });
  }
  return [...items.values()].filter((it) => it.subs.length);
}

// Traces into a new part on top, selected, so it can be moved and sized at once.
function autoTrace(as) {
  if (!ED.photo) return;
  const items = as === "shapes" ? traceShapes() : traceLines();
  if (!items.length) return edStatus("Nothing to trace in the box: move the photo or raise the sensitivity");
  remember();
  let n = 1;
  while (ED.doc.parts.some((p) => p.name === (n > 1 ? `trace${n}` : "trace"))) n++;
  ED.doc.parts.push({ name: n > 1 ? `trace${n}` : "trace", items });
  ED.part = ED.doc.parts.length - 1;
  setTool("select");
  ED.sel = [...items];
  edStatus(`Traced ${items.length} ${as === "shapes" ? "shape" : "line"}${items.length > 1 ? "s" : ""} into ${ED.doc.parts[ED.part].name}`);
}
