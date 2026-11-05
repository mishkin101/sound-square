// sound-square geometry: lines as editable curves.
//
// Every line, drawn or imported, is a list of nodes. A node is a point with two
// handles: `in` (ix, iy) shapes the curve arriving at it, `out` (ox, oy) the one
// leaving it. A straight piece has its handles pulled back onto the points.
// A subpath is { nodes, closed }; between two nodes runs one cubic curve:
// a, a.out, b.in, b.

function node(x, y) { return { x, y, ix: x, iy: y, ox: x, oy: y }; }

// ---- SVG path data -> subpaths -------------------------------------------------

// Reads any SVG path data (all commands, relative or absolute, arcs included).
const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
function parsePathD(d) {
  const subs = [];
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, sub = null, lastC = null, lastQ = null;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => {
    ws(); NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) throw new Error(`Can't read path data near "${d.slice(i, i + 12)}"`);
    i = NUM.lastIndex;
    return Number(m[0]);
  };
  const flag = () => { ws(); const c = d[i++]; if (c !== "0" && c !== "1") throw new Error("Can't read an arc flag"); return c === "1"; };
  const open = () => {
    if (!sub || sub.closed) { sub = { nodes: [node(x, y)], closed: false }; subs.push(sub); }
    return sub.nodes;
  };
  const curveTo = (c1x, c1y, c2x, c2y, px, py) => {
    const nodes = open(), prev = nodes[nodes.length - 1];
    prev.ox = c1x; prev.oy = c1y;
    nodes.push({ x: px, y: py, ix: c2x, iy: c2y, ox: px, oy: py });
    x = px; y = py;
  };
  const lineTo = (px, py) => curveTo(x, y, px, py, px, py);
  const quadTo = (qx, qy, px, py) => {
    curveTo(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py), px, py);
    lastQ = [qx, qy];
  };

  while (true) {
    ws();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    else if (!cmd) throw new Error("Path data has to start with a command");
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    const wasC = lastC, wasQ = lastQ;
    lastC = lastQ = null;
    switch (C) {
      case "M":
        x = ox + num(); y = oy + num();
        sub = { nodes: [node(x, y)], closed: false };
        subs.push(sub);
        sx = x; sy = y;
        cmd = rel ? "l" : "L"; // more pairs after a move are lines
        break;
      case "L": { const px = ox + num(), py = oy + num(); lineTo(px, py); break; }
      case "H": lineTo(ox + num(), y); break;
      case "V": lineTo(x, oy + num()); break;
      case "C": {
        const a = ox + num(), b = oy + num(), c = ox + num(), e = oy + num(), px = ox + num(), py = oy + num();
        curveTo(a, b, c, e, px, py);
        lastC = [c, e];
        break;
      }
      case "S": {
        const [a, b] = wasC ? [2 * x - wasC[0], 2 * y - wasC[1]] : [x, y];
        const c = ox + num(), e = oy + num(), px = ox + num(), py = oy + num();
        curveTo(a, b, c, e, px, py);
        lastC = [c, e];
        break;
      }
      case "Q": { const qx = ox + num(), qy = oy + num(), px = ox + num(), py = oy + num(); quadTo(qx, qy, px, py); break; }
      case "T": {
        const [qx, qy] = wasQ ? [2 * x - wasQ[0], 2 * y - wasQ[1]] : [x, y];
        quadTo(qx, qy, ox + num(), oy + num());
        break;
      }
      case "A": {
        const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(), px = ox + num(), py = oy + num();
        const segs = arcToCubics(x, y, rx, ry, rot, large, sweep, px, py);
        if (!segs) lineTo(px, py);
        else for (const s of segs) curveTo(...s);
        break;
      }
      case "Z":
        if (sub && !sub.closed) {
          const n = sub.nodes, f = n[0], l = n[n.length - 1];
          if (n.length > 1 && Math.hypot(l.x - f.x, l.y - f.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; n.pop(); }
          sub.closed = true;
        }
        x = sx; y = sy;
        break;
      default:
        throw new Error(`Unknown path command ${cmd}`);
    }
  }
  return subs.filter((s) => s.nodes.length > 1 || s.closed);
}

// An elliptical arc as cubic curves [c1x, c1y, c2x, c2y, x, y], or null when
// it's really a straight line (the SVG rules for arcs, F.6.5).
function arcToCubics(x1, y1, rx, ry, rotDeg, large, sweep, x2, y2) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return null;
  const phi = (rotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9)), step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const at = (ux, uy) => [cx + rx * ux * cos - ry * uy * sin, cy + rx * ux * sin + ry * uy * cos];
  const out = [];
  for (let j = 0, t = t1; j < n; j++, t += step) {
    const c1 = Math.cos(t), s1 = Math.sin(t), c2 = Math.cos(t + step), s2 = Math.sin(t + step);
    out.push([...at(c1 - k * s1, s1 + k * c1), ...at(c2 + k * s2, s2 - k * c2), ...at(c2, s2)]);
  }
  return out;
}

// The basic SVG shapes as path data, so everything goes through parsePathD.
function elementPathD(el) {
  const n = (a) => el[a].baseVal.value;
  switch (el.localName) {
    case "path": return el.getAttribute("d") || "";
    case "rect": {
      const x = n("x"), y = n("y"), w = n("width"), h = n("height");
      const hasX = el.hasAttribute("rx"), hasY = el.hasAttribute("ry");
      const rx = Math.min(w / 2, hasX ? n("rx") : hasY ? n("ry") : 0), ry = Math.min(h / 2, hasY ? n("ry") : hasX ? n("rx") : 0);
      if (!rx || !ry) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}` +
        `H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
    }
    case "circle": case "ellipse": {
      const cx = n("cx"), cy = n("cy"), rx = el.localName === "circle" ? n("r") : n("rx"), ry = el.localName === "circle" ? n("r") : n("ry");
      return `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
    }
    case "line": return `M${n("x1")},${n("y1")}L${n("x2")},${n("y2")}`;
    default: { // polyline, polygon
      const pts = el.points, list = Array.from({ length: pts.numberOfItems }, (_, i) => pts.getItem(i));
      return list.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("") + (el.localName === "polygon" ? "Z" : "");
    }
  }
}

// ---- Subpaths -> SVG path data -------------------------------------------------

function subsToD(subs) {
  const f = (v) => Math.round(v * 10) / 10;
  return subs.map(({ nodes, closed }) => {
    let d = `M${f(nodes[0].x)},${f(nodes[0].y)}`;
    const seg = (a, b) => (isStraight(a, b) ? `L${f(b.x)},${f(b.y)}` : `C${f(a.ox)},${f(a.oy)} ${f(b.ix)},${f(b.iy)} ${f(b.x)},${f(b.y)}`);
    for (let i = 1; i < nodes.length; i++) d += seg(nodes[i - 1], nodes[i]);
    if (closed) d += (nodes.length > 1 ? seg(nodes[nodes.length - 1], nodes[0]) : "") + "Z";
    return d;
  }).join("");
}

function isStraight(a, b) { return a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y; }

// ---- Moving things -------------------------------------------------------------

// Applies a DOMMatrix to every point and handle.
function transformNodes(nodes, m) {
  for (const nd of nodes) {
    for (const [kx, ky] of [["x", "y"], ["ix", "iy"], ["ox", "oy"]]) {
      const x = nd[kx], y = nd[ky];
      nd[kx] = m.a * x + m.c * y + m.e;
      nd[ky] = m.b * x + m.d * y + m.f;
    }
  }
}

// ---- Pen strokes -> curves -----------------------------------------------------

// Fewer points along the same line (Ramer-Douglas-Peucker), within `tol` units.
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b], len = Math.hypot(bx - ax, by - ay) || 1e-9;
    let far = -1, worst = tol;
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (dist > worst) { worst = dist; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// The same for a closed loop (points without the first repeated at the end):
// it's cut in two at the point farthest from the first, so both halves have ends.
function simplifyLoop(pts, tol) {
  if (pts.length < 4) return pts.slice();
  let far = 0, best = -1;
  pts.forEach(([x, y], i) => { const d = Math.hypot(x - pts[0][0], y - pts[0][1]); if (d > best) { best = d; far = i; } });
  return [...simplify(pts.slice(0, far + 1), tol), ...simplify([...pts.slice(far), pts[0]], tol).slice(1, -1)];
}

// A smooth curve through points [x, y, pressure]: each node's handles point
// along the line from the point before it to the one after (Catmull-Rom).
// A closed curve wraps around; an open one's ends have no handle outward.
function fitCurve(pts, closed = false) {
  const n = pts.length, at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  return pts.map(([x, y, p], i) => {
    const a = at(i - 1), b = at(i + 1);
    const tx = (b[0] - a[0]) / 6, ty = (b[1] - a[1]) / 6;
    const first = !closed && i === 0, last = !closed && i === n - 1;
    return { x, y, p, ix: first ? x : x - tx, iy: first ? y : y - ty, ox: last ? x : x + tx, oy: last ? y : y + ty };
  });
}

// Points every `step` units along a curve, with pressure blended between nodes.
function sampleNodes(nodes, step = 4) {
  if (nodes.length === 1) return [[nodes[0].x, nodes[0].y, nodes[0].p ?? 0.5]];
  const out = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = i === 1 ? 0 : 1; j <= n; j++) {
      const t = j / n, u = 1 - t;
      const x = u * u * u * a.x + 3 * u * u * t * a.ox + 3 * u * t * t * b.ix + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * a.oy + 3 * u * t * t * b.iy + t * t * t * b.y;
      out.push([x, y, (a.p ?? 0.5) * u + (b.p ?? 0.5) * t]);
    }
  }
  return out;
}

// Pen pressure from speed, for a mouse or trackpad: faster is lighter. The same
// rule perfect-freehand uses, kept with the points so it survives edits.
function speedPressure(raw, size) {
  let p = 0.5;
  return raw.map(([x, y], i) => {
    if (i) {
      const sp = Math.min(1, Math.hypot(x - raw[i - 1][0], y - raw[i - 1][1]) / size);
      p = Math.min(1, p + (Math.min(1, 1 - sp) - p) * sp * 0.275);
    }
    return [x, y, Math.round(p * 100) / 100];
  });
}

// The same line with fewer points: each call keeps about 60% of them, smoothing
// out the small wobbles first. Pen pressure comes along.
function fewerNodes(nodes, closed) {
  const target = Math.max(closed ? 3 : 2, Math.floor(nodes.length * 0.6));
  if (nodes.length <= target) return nodes;
  let pts = sampleNodes(closed ? [...nodes, nodes[0]] : nodes, 2);
  if (closed) pts = pts.slice(0, -1);
  let tol = 1, kept = pts;
  while (kept.length > target && tol < 400) { tol *= 1.4; kept = closed ? simplifyLoop(pts, tol) : simplify(pts, tol); }
  return fitCurve(kept.length >= 2 ? kept : pts.slice(0, 2), closed);
}

// Splits the curve from node ni to the next in two at t without changing its
// shape (de Casteljau). The new node goes in at ni + 1.
function splitNodes(nodes, ni, t) {
  const a = nodes[ni], b = nodes[(ni + 1) % nodes.length];
  const lerp = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const q0 = lerp([a.x, a.y], [a.ox, a.oy]), q1 = lerp([a.ox, a.oy], [b.ix, b.iy]), q2 = lerp([b.ix, b.iy], [b.x, b.y]);
  const r0 = lerp(q0, q1), r1 = lerp(q1, q2), m = lerp(r0, r1);
  a.ox = q0[0]; a.oy = q0[1];
  b.ix = q2[0]; b.iy = q2[1];
  const nd = { x: m[0], y: m[1], ix: r0[0], iy: r0[1], ox: r1[0], oy: r1[1] };
  if (a.p != null) nd.p = Math.round(((a.p ?? 0.5) * (1 - t) + (b.p ?? 0.5) * t) * 100) / 100;
  nodes.splice(ni + 1, 0, nd);
  return nd;
}

// The same line with its wobbles smoothed out: points along it are pulled
// toward their neighbors a few times, then fitted again. Pressure is smoothed
// too, so the width swells and thins more evenly. Open ends stay put.
function smoothNodes(nodes, closed) {
  let pts = sampleNodes(closed ? [...nodes, nodes[0]] : nodes, 3);
  if (closed) pts = pts.slice(0, -1);
  const n = pts.length;
  if (n < 4) return nodes;
  for (let pass = 0; pass < 6; pass++) {
    pts = pts.map((q, i) => {
      if (!closed && (i === 0 || i === n - 1)) return q;
      const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      return q.map((v, k) => (a[k] + 2 * v + b[k]) / 4);
    });
  }
  // no more points than it had, so it stays as easy to reshape
  const most = Math.max(nodes.length, closed ? 4 : 2);
  let tol = 1.5, kept;
  do { kept = closed ? simplifyLoop(pts, tol) : simplify(pts, tol); tol *= 1.4; } while (kept.length > most && tol < 80);
  return fitCurve(kept, closed);
}
