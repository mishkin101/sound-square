// sound-square shape documents: a shape as the Shapes tab edits it.
//
// A document is parts (bottom to top, each maybe `hidden`), holding items, in units of 0-1000
// across the shape's box (the box is one spot's size on the square):
//   stroke: a pen line. Its curve runs through `nodes` (with pen pressure p),
//           and it's drawn as an outline `size` wide that thins with less pressure
//           (by `taper`, 0-1), with pointed ends as long as `ends` says.
//           It can have a fill too: the area it encloses, closed with a straight
//           edge from its end back to its start, drawn under the line.
//   path:   any other line or filled area, from an imported SVG: `subs` of nodes,
//           with a fill and a stroke, each a color as drawn and maybe a palette slot.
//
// Saving writes a plain SVG anyone can open, plus the document itself in a
// <metadata> block, so strokes reopen as strokes. If the SVG was changed
// somewhere else since, the studio reads the SVG instead (strokes come back as
// filled outlines).

const DOC_UNITS = 1000;

function emptyDoc(name) { return { name, parts: [{ name: "body", items: [] }], motions: [], notes: [] }; }

// Motions are kept on their own in the SVG, so they come back even when the
// drawing was changed somewhere else.
function docFromSVG(name, text) {
  const saved = savedEdits(text);
  const doc = saved ? { name, parts: saved.parts, notes: [] } : importSVG(name, text);
  doc.motions = readMotions(text);
  return doc;
}

// Any SVG as path items, fitted into the shape's box the way the square fits it.
function importSVG(name, text) {
  return withSvg(text, (svg) => {
    const box = svgBox(svg), s = DOC_UNITS / Math.max(box.width, box.height, 1e-6);
    const fit = new DOMMatrix([s, 0, 0, s, DOC_UNITS / 2 - (box.x + box.width / 2) * s, DOC_UNITS / 2 - (box.y + box.height / 2) * s]);
    const parts = [], notes = new Set();
    const partNamed = (n) => {
      let p = parts.find((x) => x.name === n);
      if (!p) parts.push((p = { name: n, items: [] }));
      return p;
    };
    for (const { el, chain, cs, fill, stroke } of svgElements(svg)) {
      let subs;
      try { subs = parsePathD(elementPathD(el)); } catch { notes.add("some path data couldn't be read"); continue; }
      const m = fit.multiply(chain.matrix), scaleW = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      for (const sub of subs) transformNodes(sub.nodes, m);
      if (fill?.gradient || stroke?.gradient) notes.add("gradients and patterns came in grey");
      partNamed(cleanName(chain.parts[chain.parts.length - 1] || "") || "body").items.push({
        kind: "path", subs,
        fill: fill?.hex ?? null, fillA: round2(chain.opacity * parseFloat(cs.fillOpacity) * (fill?.a ?? 1)), fillSlot: slotAttr(el, "fill"),
        stroke: stroke?.hex ?? null, strokeA: round2(chain.opacity * parseFloat(cs.strokeOpacity) * (stroke?.a ?? 1)), strokeSlot: slotAttr(el, "stroke"),
        width: round2(parseFloat(cs.strokeWidth) * scaleW), rule: cs.fillRule === "evenodd" ? "evenodd" : "nonzero",
        cap: cs.strokeLinecap, join: cs.strokeLinejoin,
      });
    }
    if (svg.querySelector("text, use, image")) notes.add("text, <use> and images are left out");
    // a studio file whose saved document no longer matches the SVG
    if (EDITS.test(text)) notes.add("changed outside the studio, so pen lines came in as outlines");
    if (!parts.length) parts.push({ name: "body", items: [] });
    return { name, parts, notes: [...notes] };
  });
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

// Names become file and part names: letters, digits, - and _.
function cleanName(s) { return String(s).trim().replace(/\s+/g, "-").replace(/[^\w-]/g, "").slice(0, 40); }

// ---- Saving --------------------------------------------------------------------

const EDITS = /[ \t]*<metadata id="sound-square-edit"><!\[CDATA\[([\s\S]*?)\]\]><\/metadata>\n/;

// The document saved in an SVG, if the rest of the SVG is still as the studio wrote it.
function savedEdits(text) {
  const m = EDITS.exec(text);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]);
    if (data.check === hashText(text.replace(EDITS, ""))) return data;
  } catch {}
  return null;
}

function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

// The SVG: a group per part, bottom to top. Colors are written as they are in
// the palette now; data-*-slot says which slot they follow on the square.
function docToSVG(doc, col) {
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DOC_UNITS} ${DOC_UNITS}">`];
  for (const part of doc.parts) {
    if (!part.items.length) continue;
    lines.push(`  <g id="${part.name}" data-name="${part.name}"${part.hidden ? ` display="none"` : ""}>`); // hidden on the square too
    for (const it of part.items) lines.push(`    ${itemSVG(it, col)}`);
    lines.push(`  </g>`);
  }
  if (doc.motions?.length) lines.push(`  <metadata id="sound-square-motion"><![CDATA[${JSON.stringify(doc.motions)}]]></metadata>`);
  lines.push(`</svg>`, "");
  const body = lines.join("\n");
  const data = { v: 1, check: hashText(body), parts: doc.parts.map((p) => ({ name: p.name, ...(p.hidden ? { hidden: true } : {}), items: p.items.map(roundItem) })) };
  return body.replace(/<\/svg>\n$/, `  <metadata id="sound-square-edit"><![CDATA[${JSON.stringify(data)}]]></metadata>\n</svg>\n`);
}

function itemSVG(it, col) {
  if (it.kind === "stroke") {
    const line = `<path d="${strokeOutlineD(it)}" fill="${slotColor(it.slot, col)}" data-fill-slot="${it.slot}"/>`;
    if (!it.fill) return line;
    const fill = it.fillSlot ? slotColor(it.fillSlot, col, it.fill) : it.fill;
    return `<path d="${subsToD([{ nodes: it.nodes, closed: true }])}" fill="${fill}"` +
      `${(it.fillA ?? 1) < 1 ? ` fill-opacity="${it.fillA}"` : ""}${it.fillSlot ? ` data-fill-slot="${it.fillSlot}"` : ""}/>\n    ${line}`;
  }
  const a = [`d="${subsToD(it.subs)}"`];
  a.push(`fill="${it.fill ? (it.fillSlot ? slotColor(it.fillSlot, col, it.fill) : it.fill) : "none"}"`);
  if (it.fill && it.fillA < 1) a.push(`fill-opacity="${it.fillA}"`);
  if (it.fill && it.rule === "evenodd") a.push(`fill-rule="evenodd"`);
  if (it.fillSlot) a.push(`data-fill-slot="${it.fillSlot}"`);
  if (it.stroke && it.width > 0) {
    a.push(`stroke="${it.strokeSlot ? slotColor(it.strokeSlot, col, it.stroke) : it.stroke}"`, `stroke-width="${it.width}"`);
    if (it.strokeA < 1) a.push(`stroke-opacity="${it.strokeA}"`);
    if (it.cap && it.cap !== "butt") a.push(`stroke-linecap="${it.cap}"`);
    if (it.join && it.join !== "miter") a.push(`stroke-linejoin="${it.join}"`);
    if (it.strokeSlot) a.push(`data-stroke-slot="${it.strokeSlot}"`);
  }
  return `<path ${a.join(" ")}/>`;
}

// Points to a tenth of a unit is plenty, and keeps the files small.
function roundItem(it) {
  const nd = (n) => {
    const o = { x: round1(n.x), y: round1(n.y), ix: round1(n.ix), iy: round1(n.iy), ox: round1(n.ox), oy: round1(n.oy) };
    if (n.p != null) o.p = round2(n.p);
    return o;
  };
  return it.kind === "stroke"
    ? { ...it, nodes: it.nodes.map(nd) }
    : { ...it, subs: it.subs.map((s) => ({ closed: s.closed, nodes: s.nodes.map(nd) })) };
}

// ---- Drawing -------------------------------------------------------------------

// A pen stroke's outline as path data: perfect-freehand's getStroke when it's
// loaded, or a plain even-width outline without it (offline).
function strokeOutlineD(it) {
  const pts = sampleNodes(it.nodes);
  const outline = window.getStroke
    ? getStroke(pts, strokeOptions(it.size, it.taper, it.ends, true))
    : evenOutline(pts, it.size);
  return outlineD(outline);
}

// perfect-freehand's settings for a pencil line. taper: how much the width
// follows pressure (0 is even). ends: how long the pointed ends are, 0 for none,
// 1 for eight times the line's width.
function strokeOptions(size, taper = 0.6, ends = 0, last = true) {
  const point = (ends ?? 0) * size * 8;
  return {
    size, thinning: taper ?? 0.6, smoothing: 0.5, streamline: 0, simulatePressure: false, last,
    start: { taper: point, cap: true }, end: { taper: point, cap: true },
  };
}

// A closed outline through points, smoothed with curves through their midpoints.
function outlineD(pts) {
  if (pts.length < 3) return "";
  const f = round1, mid = (a, b) => f((a + b) / 2);
  let d = `M${f(pts[0][0])},${f(pts[0][1])} Q${f(pts[1][0])},${f(pts[1][1])} ${mid(pts[1][0], pts[2][0])},${mid(pts[1][1], pts[2][1])} T`;
  for (let i = 2; i < pts.length - 1; i++) d += `${mid(pts[i][0], pts[i + 1][0])},${mid(pts[i][1], pts[i + 1][1])} `;
  return d + "Z";
}

function evenOutline(pts, size) {
  if (pts.length < 2) return pts.length ? [0, 1, 2, 3, 4, 5].map((k) => [pts[0][0] + (size / 2) * Math.cos(k), pts[0][1] + (size / 2) * Math.sin(k)]) : [];
  const left = [], right = [];
  pts.forEach(([x, y], i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / len) * (size / 2), ny = ((b[0] - a[0]) / len) * (size / 2);
    left.push([x + nx, y + ny]);
    right.push([x - nx, y - ny]);
  });
  return [...left, ...right.reverse()];
}

// Each item's path, made once and kept until the item changes (touchItem).
// A pen line's fill has a path of its own.
const ITEM_PATHS = new WeakMap(), ITEM_FILLS = new WeakMap();
function itemPath(it) {
  let p = ITEM_PATHS.get(it);
  if (!p) { p = new Path2D(it.kind === "stroke" ? strokeOutlineD(it) : subsToD(it.subs)); ITEM_PATHS.set(it, p); }
  return p;
}
function strokeFillPath(it) {
  let p = ITEM_FILLS.get(it);
  if (!p) { p = new Path2D(subsToD([{ nodes: it.nodes, closed: true }])); ITEM_FILLS.set(it, p); }
  return p;
}
function touchItem(it) { ITEM_PATHS.delete(it); ITEM_FILLS.delete(it); }

function drawItem(ctx, it, col) {
  const path = itemPath(it), alpha = ctx.globalAlpha;
  if (it.kind === "stroke") {
    if (it.fill) {
      ctx.globalAlpha = alpha * (it.fillA ?? 1);
      ctx.fillStyle = it.fillSlot ? slotColor(it.fillSlot, col, it.fill) : it.fill;
      ctx.fill(strokeFillPath(it));
      ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = slotColor(it.slot, col);
    ctx.fill(path);
    return;
  }
  if (it.fill) {
    ctx.globalAlpha = alpha * it.fillA;
    ctx.fillStyle = it.fillSlot ? slotColor(it.fillSlot, col, it.fill) : it.fill;
    ctx.fill(path, it.rule);
  }
  if (it.stroke && it.width > 0) {
    ctx.globalAlpha = alpha * it.strokeA;
    ctx.strokeStyle = it.strokeSlot ? slotColor(it.strokeSlot, col, it.stroke) : it.stroke;
    ctx.lineWidth = it.width;
    ctx.lineCap = it.cap || "butt";
    ctx.lineJoin = it.join || "miter";
    ctx.stroke(path);
  }
  ctx.globalAlpha = alpha;
}

// The top item under (x, y), within `reach` units of its line, as { part, item }.
const HIT = document.createElement("canvas").getContext("2d");
function itemAt(doc, x, y, reach = 8) {
  for (let pi = doc.parts.length - 1; pi >= 0; pi--) {
    if (doc.parts[pi].hidden) continue; // a hidden part can't be picked
    const items = doc.parts[pi].items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i], path = itemPath(it);
      HIT.lineWidth = Math.max(2 * reach, it.kind === "path" && it.stroke ? it.width + 2 * reach : 0);
      const inFill = it.kind === "stroke" && it.fill && it.nodes.length > 2 && HIT.isPointInPath(strokeFillPath(it), x, y);
      if (inFill || ((it.kind === "stroke" || it.fill) && HIT.isPointInPath(path, x, y, it.rule)) || HIT.isPointInStroke(path, x, y)) {
        return { part: doc.parts[pi], item: it };
      }
    }
  }
  return null;
}
