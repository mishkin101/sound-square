// sound-square Shapes tab: make and edit the shapes the square uses.
//
// On the left, the library: every SVG in shapes/, plus new and imported ones not
// saved yet. In the middle, the shape on a large canvas, on the ground color,
// with one spot's circle as a guide. On the right, the tools, the line color and
// size, the parts (top to bottom, like layers) and the imported colors.
// See shapedoc.js for what a shape is made of, tools.js for Select and Points.
// The Motion side of the panel sets how the shape moves (motions.js), with the
// canvas playing it. The Photo tool puts a sketch under the drawing (trace.js).

const ED = {
  doc: null,
  name: "",
  mode: "draw",    // or "motion"
  tool: "pencil",  // select, points, pencil, eraser, photo, or a shape
  sel: [],         // selected lines (Select)
  target: null,    // the line whose points are showing (Points)
  nodesSel: new Set(), // its selected points, as "subpath:point"
  drag: null,      // what a Select or Points drag is doing
  slot: "ink",     // the palette slot new lines and shape outlines take (null: no line, shapes only)
  fillSlot: null,  // and new fills (null: none)
  // the pencil's pressure and pointed ends, and the shapes' settings
  toolOpts: { taper: 0.6, ends: 0, corners: 0, sides: 6, points: 5, inner: 0.45 },
  redraw: true,    // the pencil reshapes a line it's drawn over
  photo: null,     // the sketch under the drawing: { img, blob, x, y, w, rot, alpha, hidden }
  traceOpts: { sensitivity: 60, specks: 12, show: true },
  traceView: null, // what auto-trace would pick up, as a picture
  size: 24,
  part: 0,         // index of the part new lines go into
  history: [],     // earlier parts as JSON, for undo
  future: [],      // for redo
  dirty: false,
  drafts: {},      // unsaved shapes by name, kept while the page is open
  cur: null,       // the line being drawn: { raw, pen }
  erasing: null,
  hover: null,
  library: [],
  renaming: null,  // index of the part whose name is being edited
  view: { scale: 1, ox: 0, oy: 0, fit: true }, // zoom and pan: screen px = o + units * scale
  pan: null,       // a pan drag: where it started
  hand: false,     // H held: dragging pans
};

// ---- Square / Shapes ---------------------------------------------------------

function setView(view) {
  const shapes = view === "shapes";
  if (shapes === document.body.classList.contains("shapes")) return;
  document.body.classList.toggle("shapes", shapes);
  for (const b of document.querySelectorAll("[data-view]")) b.classList.toggle("on", b.dataset.view === view);
  if (shapes) {
    if (EDIT.on) setEdit(false);
    noLoop(); // the square rests while it's hidden
    if (!ED.doc) openShape(firstShapeName());
    else { edUI(); renderEditor(); }
    refreshLibrary();
  } else {
    loop();
    windowResized();
  }
}

function firstShapeName() {
  const picked = SCORE.layers[EDIT.layer]?.clips?.[EDIT.clip];
  if (picked?.shape) return picked.shape;
  for (const R of SCORE.layers) for (const c of R.clips) if (c.shape) return c.shape;
  return newShapeName();
}

// shape1, shape2…, or for an import its file name, then name-2, name-3…
function newShapeName(base) {
  const taken = (n) => ED.library.includes(n) || SHAPES[n] || ED.drafts[n] || n === ED.name;
  if (base && !taken(base)) return base;
  const name = (n) => (base ? `${base}-${n}` : `shape${n}`);
  let n = base ? 2 : 1;
  while (taken(name(n))) n++;
  return name(n);
}

// ---- Library -----------------------------------------------------------------

// The shapes in shapes/ (from the server's folder listing), the ones the square
// uses, and unsaved ones.
async function refreshLibrary() {
  const names = new Set(SCORE.layers.flatMap((R) => R.clips).filter((c) => c.shape).map((c) => c.shape));
  try {
    const html = await (await fetch("shapes/", { cache: "no-cache" })).text();
    for (const m of html.matchAll(/href="([^"?#]+)\.svg"/g)) names.add(decodeURIComponent(m[1]).split("/").pop());
  } catch {}
  for (const n of Object.keys(ED.drafts)) names.add(n);
  if (ED.name) names.add(ED.name);
  ED.library = [...names].sort();
  renderLibrary();
  renderShapeMenus();
}

function renderLibrary() {
  const onSquare = new Set(SCORE.layers.flatMap((R) => R.clips).map((c) => c.shape));
  $("ed-library").innerHTML = ED.library.map((n) => {
    const unsaved = (n === ED.name && ED.dirty) || ED.drafts[n];
    return `<button class="lib-item${n === ED.name ? " on" : ""}" data-name="${n}">` +
      `<span>${n}${unsaved ? " •" : ""}</span><span class="dimmed">${onSquare.has(n) ? "square" : ""}</span></button>`;
  }).join("");
}

// Leaves the current shape (kept as a draft if it has changes) and opens another.
async function openShape(name) {
  if (ED.doc && ED.dirty) ED.drafts[ED.name] = { doc: ED.doc, history: ED.history, future: ED.future };
  const draft = ED.drafts[name];
  if (draft) {
    Object.assign(ED, draft, { name, dirty: true });
    delete ED.drafts[name];
  } else {
    let doc;
    // a brand-new name has no file yet
    if (!ED.library.includes(name) && !SHAPES[name]) doc = emptyDoc(name);
    else try {
      const res = await fetch(`shapes/${encodeURIComponent(name)}.svg`, { cache: "no-cache" });
      doc = res.ok ? docFromSVG(name, await res.text()) : emptyDoc(name);
    } catch (e) {
      edStatus(e.message);
      doc = emptyDoc(name);
    }
    Object.assign(ED, { doc, name, history: [], future: [], dirty: false });
  }
  ED.part = ED.doc.parts.length - 1;
  dropSelection();
  renderMotions();
  edStatus(ED.doc.notes?.length ? ED.doc.notes.join(" · ") : "");
  edUI();
  renderEditor();
  renderLibrary();
}

function newShape() {
  const name = newShapeName();
  openShape(name).then(() => refreshLibrary());
}

async function importFile(file) {
  if (!file) return;
  const name = newShapeName(cleanName(file.name.replace(/\.svg$/i, "")) || "imported");
  try {
    const doc = docFromSVG(name, await file.text());
    if (ED.doc && ED.dirty) ED.drafts[ED.name] = { doc: ED.doc, history: ED.history, future: ED.future };
    Object.assign(ED, { doc, name, history: [], future: [], dirty: true, part: doc.parts.length - 1 });
    dropSelection();
    renderMotions();
    edStatus(`Imported ${file.name}` + (doc.notes.length ? ` · ${doc.notes.join(" · ")}` : "") + " · Save to keep it");
    refreshLibrary();
    edUI();
    renderEditor();
  } catch (e) {
    edStatus(`${file.name}: ${e.message}`);
  }
}

// ---- Changes and undo --------------------------------------------------------

function dropSelection() { ED.sel = []; ED.target = null; ED.nodesSel = new Set(); ED.drag = null; }

// Undo keeps the parts and the motions together.
function snapshot() { return JSON.stringify({ parts: ED.doc.parts, motions: ED.doc.motions ?? [] }); }
function restore(json) { Object.assign(ED.doc, JSON.parse(json)); }

function remember() {
  ED.history.push(snapshot());
  if (ED.history.length > 200) ED.history.shift();
  ED.future = [];
  if (!ED.dirty) { ED.dirty = true; renderLibrary(); }
}

function undoEdit() {
  if (!ED.history.length) return;
  ED.future.push(snapshot());
  restore(ED.history.pop());
  ED.part = Math.min(ED.part, ED.doc.parts.length - 1);
  dropSelection();
  edUI();
  renderMotions();
  renderEditor();
}

function redoEdit() {
  if (!ED.future.length) return;
  ED.history.push(snapshot());
  restore(ED.future.pop());
  dropSelection();
  edUI();
  renderMotions();
  renderEditor();
}

// ---- Drawing -----------------------------------------------------------------

function edPoint(e) {
  const r = $("ed-canvas").getBoundingClientRect(), v = ED.view;
  return [round1((e.clientX - r.left - v.ox) / v.scale), round1((e.clientY - r.top - v.oy) / v.scale), e.pressure];
}

// A finished pen line becomes a smooth curve through fewer points, or reshapes
// the line it was drawn over.
function finishLine() {
  const { raw, pen, over } = ED.cur;
  ED.cur = null;
  const pts = pen ? raw.map(([x, y, p]) => [x, y, round2(p)]) : speedPressure(raw, ED.size);
  remember();
  if (redrawLine(pts, over)) return edUI();
  const o = ED.toolOpts;
  const line = { kind: "stroke", nodes: fitCurve(simplify(pts, 2.5)), size: ED.size, taper: o.taper, ends: o.ends, slot: ED.slot ?? "ink" };
  if (ED.fillSlot) Object.assign(line, { fill: slotColor(ED.fillSlot, edPalette()), fillA: 1, fillSlot: ED.fillSlot });
  ED.doc.parts[ED.part].hidden = false; // drawing into a hidden part shows it
  ED.doc.parts[ED.part].items.push(line);
  edUI();
}

function eraseAt([x, y]) {
  const hit = itemAt(ED.doc, x, y);
  if (!hit) return false;
  hit.part.items.splice(hit.part.items.indexOf(hit.item), 1);
  return true;
}

function wireEditor() {
  const cv = $("ed-canvas");
  cv.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || (e.button === 0 && ED.hand)) {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      ED.pan = { x: e.clientX, y: e.clientY, ox: ED.view.ox, oy: ED.view.oy };
      return renderEditor();
    }
    if (e.button !== 0 || ED.mode === "motion") return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const pt = edPoint(e);
    if (ED.tool === "select") selectDown(pt, e);
    else if (ED.tool === "points") pointsDown(pt, e);
    else if (SHAPE_TOOLS[ED.tool]) shapeDown(pt, e);
    else if (ED.tool === "photo") { if (ED.photo && !ED.photo.hidden) ED.drag = { kind: "photo", start: pt, x: ED.photo.x, y: ED.photo.y }; }
    else if (ED.tool === "eraser") {
      remember();
      ED.erasing = { any: eraseAt(pt) };
    } else {
      // starting on a line: redraw it (Alt draws a new line)
      ED.cur = { raw: [pt], pen: e.pointerType === "pen", over: ED.redraw && !e.altKey ? lineSpotAt(pt) : null };
    }
    edUI();
    renderEditor();
  });
  cv.addEventListener("pointermove", (e) => {
    if (ED.pan) {
      Object.assign(ED.view, { ox: ED.pan.ox + e.clientX - ED.pan.x, oy: ED.pan.oy + e.clientY - ED.pan.y, fit: false });
      return renderEditor();
    }
    ED.hover = edPoint(e);
    if (ED.drag) {
      ({ select: selectDrag, points: pointsDrag, photo: photoDrag }[ED.tool] ?? shapeDrag)(ED.hover, e);
      return renderEditor();
    }
    if (!ED.cur && !ED.erasing) return renderEditor();
    const evs = e.getCoalescedEvents?.();
    for (const ev of evs?.length ? evs : [e]) {
      if (ED.cur) ED.cur.raw.push(edPoint(ev));
      else if (eraseAt(edPoint(ev))) ED.erasing.any = true;
    }
    renderEditor();
  });
  const up = () => {
    if (ED.pan) { ED.pan = null; return renderEditor(); }
    if (ED.drag) {
      ({ select: selectUp, points: pointsUp, photo: keepPhoto }[ED.tool] ?? shapeUp)();
      ED.drag = null;
      edUI();
    }
    if (ED.erasing) {
      if (!ED.erasing.any) ED.history.pop(); // nothing erased, nothing to undo
      ED.erasing = null;
      edUI();
    }
    if (ED.cur) finishLine();
    renderEditor();
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", () => { ED.hover = null; renderEditor(); });
  cv.addEventListener("dblclick", (e) => {
    if (ED.tool !== "points") return;
    pointsDouble(edPoint(e));
    edUI();
    renderEditor();
  });
  new ResizeObserver(sizeEditor).observe($("ed-stage"));
  // a photo dropped on the canvas goes under the drawing; an SVG opens as a shape
  $("ed-stage").addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
  $("ed-stage").addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    if (/svg/.test(file.type) || /\.svg$/i.test(file.name)) importFile(file);
    else if (file.type.startsWith("image/")) choosePhoto(file);
  });
  // zoom: pinch or ⌘-scroll, toward the pointer; scrolling pans
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    else { ED.view.ox -= e.deltaX; ED.view.oy -= e.deltaY; ED.view.fit = false; renderEditor(); }
  }, { passive: false });
  $("ed-zoom-in").addEventListener("click", (e) => { e.currentTarget.blur(); zoomAt(1.5); });
  $("ed-zoom-out").addEventListener("click", (e) => { e.currentTarget.blur(); zoomAt(1 / 1.5); });
  $("ed-zoom-fit").addEventListener("click", (e) => { e.currentTarget.blur(); fitView(); });
  document.addEventListener("keyup", (e) => { if (e.key.toLowerCase() === "h" && ED.hand) { ED.hand = false; renderEditor(); } });

  // library
  $("ed-library").addEventListener("click", (e) => {
    const b = e.target.closest(".lib-item");
    if (b && b.dataset.name !== ED.name) openShape(b.dataset.name);
  });
  $("ed-new").addEventListener("click", (e) => { e.currentTarget.blur(); newShape(); });
  $("ed-import").addEventListener("click", (e) => { e.currentTarget.blur(); $("ed-import-file").click(); });
  $("ed-import-file").addEventListener("change", (e) => { importFile(e.target.files[0]); e.target.value = ""; });

  // shape
  $("ed-name").addEventListener("change", (e) => {
    const name = cleanName(e.target.value);
    if (name && name !== ED.name) {
      ED.name = ED.doc.name = name;
      ED.dirty = true;
      edStatus(`Save to write shapes/${name}.svg`);
      refreshLibrary();
    }
    edUI();
  });
  $("ed-save").addEventListener("click", (e) => { e.currentTarget.blur(); saveShape(); });
  $("ed-to-square").addEventListener("click", (e) => { e.currentTarget.blur(); shapeToSquare(); });
  $("ed-delete").addEventListener("click", (e) => { e.currentTarget.blur(); deleteShape(); });

  // tools
  for (const b of document.querySelectorAll("[data-tool]")) {
    b.addEventListener("click", () => { $("ed-shape-menu").hidden = true; setTool(b.dataset.tool); b.blur(); });
  }
  $("ed-shape-btn").addEventListener("click", (e) => { e.currentTarget.blur(); $("ed-shape-menu").hidden = !$("ed-shape-menu").hidden; });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".tb-group")) $("ed-shape-menu").hidden = true; });
  $("ed-fewer").addEventListener("click", (e) => { e.currentTarget.blur(); fewerPoints(); edUI(); renderEditor(); });
  $("ed-undo").addEventListener("click", (e) => { e.currentTarget.blur(); undoEdit(); });
  $("ed-redo").addEventListener("click", (e) => { e.currentTarget.blur(); redoEdit(); });
  // the fill, line and weight of new lines and shapes, and the shape settings
  $("ed-size").addEventListener("input", (e) => { ED.size = Number(e.target.value); edUI(); });
  $("ed-redraw").addEventListener("change", (e) => { ED.redraw = e.target.checked; e.target.blur(); });
  swatchRow($("ed-slots"), true, (slot) => { ED.slot = slot; });
  swatchRow($("ed-new-fill"), true, (slot) => { ED.fillSlot = slot; });
  for (const input of document.querySelectorAll("[data-opt]")) {
    input.addEventListener("input", () => { ED.toolOpts[input.dataset.opt] = Number(input.value); edUI(); });
  }

  // the photo: choose, place, trace
  $("ed-photo-pick").addEventListener("click", (e) => { e.currentTarget.blur(); $("ed-photo-file").click(); });
  $("ed-photo-file").addEventListener("change", (e) => { choosePhoto(e.target.files[0]); e.target.value = ""; });
  const photoBtn = (id, fn) => $(id).addEventListener("click", (e) => {
    e.currentTarget.blur();
    if (!ED.photo) return;
    fn(ED.photo);
    keepPhoto();
    edUI();
    renderEditor();
  });
  photoBtn("ed-photo-fit", fitPhoto);
  photoBtn("ed-photo-hide", (p) => { p.hidden = !p.hidden; });
  photoBtn("ed-photo-remove", () => { ED.photo = null; ED.traceView = null; });
  for (const input of document.querySelectorAll("[data-photo]")) {
    input.addEventListener("input", () => {
      if (!ED.photo) return;
      const v = Number(input.value), key = input.dataset.photo;
      ED.photo[key] = key === "w" ? (v / 100) * DOC_UNITS : v; // size: % of the box
      edUI();
      renderEditor();
    });
    input.addEventListener("change", keepPhoto);
  }
  for (const input of document.querySelectorAll("[data-trace]")) {
    input.addEventListener("input", () => { ED.traceOpts[input.dataset.trace] = Number(input.value); edUI(); renderEditor(); });
  }
  $("ed-trace-show").addEventListener("change", (e) => { ED.traceOpts.show = e.target.checked; e.target.blur(); renderEditor(); });
  $("ed-trace-lines").addEventListener("click", (e) => { e.currentTarget.blur(); autoTrace("lines"); edUI(); renderEditor(); });
  $("ed-trace-shapes").addEventListener("click", (e) => { e.currentTarget.blur(); autoTrace("shapes"); edUI(); renderEditor(); });
  restorePhoto();

  // Draw | Motion
  for (const b of document.querySelectorAll("[data-mode]")) {
    b.addEventListener("click", () => { setMode(b.dataset.mode); b.blur(); });
  }
  $("ed-add-motion").addEventListener("click", (e) => {
    e.currentTarget.blur();
    remember();
    (ED.doc.motions ??= []).push(newMotion(ED.doc.motions.length ? "blink" : "pop"));
    renderMotions();
    replayPreview();
  });
  $("ed-replay").addEventListener("click", (e) => { e.currentTarget.blur(); replayPreview(); });
  $("ed-motions").addEventListener("change", (e) => {
    const i = Number(e.target.dataset.i), key = e.target.dataset.key, m = ED.doc.motions[i];
    if (!m || !key) return;
    if (e.target.type === "range") { ED.sizing = false; return; }
    remember();
    if (key === "do") ED.doc.motions[i] = newMotion(e.target.value, m);
    else {
      m[key] = e.target.value;
      if (key === "on" && KICKS.includes(m.on) && m.decay == null) m.decay = 5;
    }
    e.target.blur();
    renderMotions();
    if (key === "do" || MOTIONS[ED.doc.motions[i].do].ons[0] === "enter") replayPreview();
  });
  $("ed-motions").addEventListener("input", (e) => {
    const i = Number(e.target.dataset.i), key = e.target.dataset.key, m = ED.doc.motions[i];
    if (!m || e.target.type !== "range") return;
    if (!ED.sizing) { remember(); ED.sizing = true; } // one undo per slider drag
    m[key] = Number(e.target.value);
    e.target.closest("label").querySelector(".val").textContent = fmtParam(m[key], Number(e.target.step));
  });
  $("ed-motions").addEventListener("click", (e) => {
    if (e.target.dataset.act !== "del") return;
    remember();
    ED.doc.motions.splice(Number(e.target.dataset.i), 1);
    renderMotions();
  });

  // selection: fill, line, line weight, part, copy, delete
  swatchRow($("ed-fill"), true, setSelFill);
  swatchRow($("ed-line"), true, setSelLine);
  $("ed-weight").addEventListener("input", (e) => {
    if (!ED.sizing) { remember(); ED.sizing = true; } // one undo per slider drag
    setSelWeight(Number(e.target.value));
    edUI();
    renderEditor();
  });
  $("ed-weight").addEventListener("change", () => { ED.sizing = false; });
  for (const id of ["ed-taper", "ed-ends"]) {
    $(id).addEventListener("input", (e) => {
      if (!ED.sizing) { remember(); ED.sizing = true; }
      setSelStroke(id === "ed-taper" ? "taper" : "ends", Number(e.target.value));
      edUI();
      renderEditor();
    });
    $(id).addEventListener("change", () => { ED.sizing = false; });
  }
  $("ed-sel-smooth").addEventListener("click", (e) => { e.currentTarget.blur(); smoothSelection(); edUI(); renderEditor(); });
  $("ed-sel-part").addEventListener("change", (e) => { moveSelectionToPart(Number(e.target.value)); e.target.blur(); edUI(); renderEditor(); });
  $("ed-sel-dup").addEventListener("click", (e) => { e.currentTarget.blur(); duplicateSelection(); edUI(); renderEditor(); });
  $("ed-sel-del").addEventListener("click", (e) => { e.currentTarget.blur(); deleteSelection(); edUI(); renderEditor(); });

  // parts
  $("ed-add-part").addEventListener("click", (e) => {
    e.currentTarget.blur();
    remember();
    let n = ED.doc.parts.length + 1;
    while (ED.doc.parts.some((p) => p.name === `part${n}`)) n++;
    ED.doc.parts.push({ name: `part${n}`, items: [] }); // on top
    ED.part = ED.doc.parts.length - 1;
    ED.renaming = ED.part;
    edUI();
  });
  $("ed-parts").addEventListener("click", (e) => {
    const row = e.target.closest(".part-row");
    if (!row || e.target.matches("input")) return;
    const i = Number(row.dataset.i), act = e.target.dataset.act, parts = ED.doc.parts;
    e.target.blur?.();
    if (act === "eye") {
      remember();
      parts[i].hidden = !parts[i].hidden;
      if (parts[i].hidden) ED.sel = ED.sel.filter((it) => !parts[i].items.includes(it)); // let go of what's hidden
      if (parts[i].hidden && ED.target && parts[i].items.includes(ED.target)) ED.target = null;
    } else if (act === "del") {
      remember();
      parts.splice(i, 1);
      if (!parts.length) parts.push({ name: "body", items: [] });
      ED.part = Math.min(ED.part, parts.length - 1);
    } else if ((e.shiftKey || ED.tool === "select") && !parts[i].hidden) {
      // Shift-click (or any click with Select): select the part's lines; Shift adds or takes away
      const items = parts[i].items, all = items.length && items.every((it) => ED.sel.includes(it));
      if (ED.tool !== "select") setTool("select");
      if (!e.shiftKey) ED.sel = [...items];
      else ED.sel = all ? ED.sel.filter((it) => !items.includes(it)) : [...new Set([...ED.sel, ...items])];
      ED.part = i;
    } else {
      ED.part = i;
    }
    edUI();
    renderEditor();
  });
  // drag a part up or down the list to put it above or below the others
  $("ed-parts").addEventListener("dragstart", (e) => {
    const row = e.target.closest?.(".part-row");
    if (!row) return;
    ED.partDrag = Number(row.dataset.i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", row.dataset.i);
  });
  $("ed-parts").addEventListener("dragover", (e) => {
    const row = e.target.closest(".part-row");
    if (ED.partDrag == null || !row) return;
    e.preventDefault();
    const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
    for (const x of $("ed-parts").children) x.classList.remove("drop-above", "drop-below");
    row.classList.add(above ? "drop-above" : "drop-below");
  });
  $("ed-parts").addEventListener("drop", (e) => {
    const row = e.target.closest(".part-row"), from = ED.partDrag;
    ED.partDrag = null;
    if (from == null || !row) return edUI();
    e.preventDefault();
    const j = Number(row.dataset.i), r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
    // the list shows the top part first: above a row means later in the parts, so drawn over it
    const to = above ? (from < j ? j : j + 1) : (from < j ? j - 1 : j);
    if (to !== from) {
      remember();
      const parts = ED.doc.parts, current = parts[ED.part], [moved] = parts.splice(from, 1);
      parts.splice(to, 0, moved);
      ED.part = parts.indexOf(current);
    }
    edUI();
    renderEditor();
  });
  $("ed-parts").addEventListener("dragend", () => { ED.partDrag = null; edUI(); });
  $("ed-parts").addEventListener("dblclick", (e) => {
    const row = e.target.closest(".part-row");
    if (row && !e.target.dataset.act) { ED.renaming = Number(row.dataset.i); edUI(); }
  });

  // imported colors
  $("ed-colors").addEventListener("change", (e) => {
    const hex = e.target.dataset.hex;
    if (!hex) return;
    remember();
    const slot = e.target.value || null;
    for (const p of ED.doc.parts) for (const it of p.items) {
      if (it.kind !== "path") continue;
      if (it.fill === hex) it.fillSlot = slot;
      if (it.stroke === hex) it.strokeSlot = slot;
    }
    e.target.blur();
    renderEditor();
  });
}

// A row of palette swatches, with a "none" one first if asked. pick(slot or null).
function swatchRow(row, withNone, pick) {
  for (const slot of [...(withNone ? ["none"] : []), ...PAINT_SLOTS]) {
    const b = document.createElement("button");
    b.className = slot === "none" ? "swatch none" : "swatch";
    b.dataset.slot = slot;
    b.title = slot === "none" ? "None" : slotLabel(slot);
    b.addEventListener("click", () => {
      pick(slot === "none" ? null : slot);
      b.blur();
      edUI();
      renderEditor();
    });
    row.append(b);
  }
}

// Swatches show the palette now; `on` is the slot to mark.
function paintSwatches(row, on, col) {
  for (const b of row.children) {
    if (b.dataset.slot !== "none") b.style.background = slotColor(b.dataset.slot, col);
    b.classList.toggle("on", b.dataset.slot === on);
  }
}

// A photo of a sketch, to trace. The Photo tool comes up to place it.
async function choosePhoto(file) {
  if (!file) return;
  try {
    await loadPhoto(file);
    setTool("photo");
    edStatus(`${file.name} is under the drawing: move and size it so what you want is in the box`);
  } catch (e) {
    edStatus(`${file.name}: can't read that picture`);
  }
}

function photoDrag(pt) {
  const d = ED.drag;
  ED.photo.x = round1(d.x + pt[0] - d.start[0]);
  ED.photo.y = round1(d.y + pt[1] - d.start[1]);
}

// Switching tools: Points picks up the selected line; Select picks up the Points line.
function setTool(tool) {
  if (tool === "points" && !ED.target && ED.sel.length) ED.target = ED.sel[0];
  if (tool === "select" && ED.target && !ED.sel.length) ED.sel = [ED.target];
  if (tool !== "points") { ED.target = null; ED.nodesSel = new Set(); }
  if (tool !== "select") ED.sel = [];
  if (tool === "pencil" && !ED.slot) ED.slot = "ink"; // a pencil line needs a color
  ED.tool = tool;
  edUI();
  renderEditor();
}

function selecting() { return ED.tool === "select" && ED.sel.length > 0; }

const EYE = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><path d="M2 14 14 2"/></svg>`;
const LOCK = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7.5" width="9" height="6" rx="1"/><path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5"/></svg>`;
const LOCK_OPEN = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7.5" width="9" height="6" rx="1"/><path d="M5.5 7.5V4.5a2.5 2.5 0 0 1 4.9-.6"/></svg>`;

// Keys while the Shapes tab is showing. True when the key was used.
function editorKey(e) {
  if (e.target.matches?.('input[type="text"]')) return false;
  const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
  if (mod && (k === "=" || k === "+")) { zoomAt(1.5); return true; }
  if (mod && k === "-") { zoomAt(1 / 1.5); return true; }
  if (mod && k === "0") { fitView(); return true; }
  if (k === "h" && !mod) { if (!ED.hand) { ED.hand = true; renderEditor(); } return true; }
  if (mod && k === "z") { e.shiftKey ? redoEdit() : undoEdit(); return true; }
  if (mod && k === "y") { redoEdit(); return true; }
  if (ED.mode === "motion") {
    if (e.key !== " ") return false;
    togglePlay();
    return true;
  }
  if (ED.tool === "photo" && ED.photo && e.key.startsWith("Arrow") && !mod) { // nudge the photo
    const step = e.shiftKey ? 10 : 1;
    ED.photo.x += { ArrowLeft: -step, ArrowRight: step }[e.key] ?? 0;
    ED.photo.y += { ArrowUp: -step, ArrowDown: step }[e.key] ?? 0;
    keepPhoto();
    renderEditor();
    return true;
  }
  if (mod && k === "a") {
    if (ED.tool === "points" && ED.target) eachNode((n, si, ni) => ED.nodesSel.add(nodeKey(si, ni)));
    else { setTool("select"); ED.sel = shownItems(); }
  } else if (mod && k === "d" && selecting()) duplicateSelection();
  else if (mod || e.altKey) return false;
  else if (k === "v") setTool("select");
  else if (k === "a") setTool("points");
  else if (k === "n") setTool("pencil");
  else if (k === "e") setTool("eraser");
  else if (k === "p") setTool("photo");
  else if (k === "r") setTool("rect");
  else if (k === "o") setTool("ellipse");
  else if (k === "l") setTool(e.shiftKey ? "arrow" : "line");
  else if (e.key === "Delete" || e.key === "Backspace") ED.tool === "points" ? deletePoints() : deleteSelection();
  else if (e.key === "Escape") { dropSelection(); $("ed-shape-menu").hidden = true; }
  else if (e.key.startsWith("Arrow")) {
    const step = e.shiftKey ? 10 : 1, dx = { ArrowLeft: -step, ArrowRight: step }[e.key] ?? 0, dy = { ArrowUp: -step, ArrowDown: step }[e.key] ?? 0;
    ED.tool === "points" ? nudgePoints(dx, dy) : moveSelection(dx, dy);
  } else if (e.key === " ") togglePlay();
  else return false;
  edUI();
  renderEditor();
  return true;
}

// ---- Showing it --------------------------------------------------------------

// The canvas fills the middle; the shape's box sits in it, zoomed and panned.
function sizeEditor() {
  const r = $("ed-stage").getBoundingClientRect(), cv = $("ed-canvas"), dpr = window.devicePixelRatio || 1;
  if (!r.width || !r.height) return; // the Square tab is showing; keep the zoom for when it's back
  const w = Math.max(64, Math.floor(r.width)), h = Math.max(64, Math.floor(r.height));
  // keep whatever is in the middle in the middle
  const mid = cv.clientWidth ? [(cv.clientWidth / 2 - ED.view.ox) / ED.view.scale, (cv.clientHeight / 2 - ED.view.oy) / ED.view.scale] : null;
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  if (ED.view.fit || !mid) fitView();
  else { ED.view.ox = w / 2 - mid[0] * ED.view.scale; ED.view.oy = h / 2 - mid[1] * ED.view.scale; renderEditor(); }
}

// The scale at which the whole box fits, with a margin, below the toolbar.
const FIT_TOP = 64, FIT_MARGIN = 24;
function fitScale() {
  const cv = $("ed-canvas");
  return Math.max(0.01, Math.min(cv.clientWidth - 2 * FIT_MARGIN, cv.clientHeight - FIT_TOP - FIT_MARGIN) / DOC_UNITS);
}

function fitView() {
  const cv = $("ed-canvas"), scale = fitScale();
  const oy = FIT_TOP + (cv.clientHeight - FIT_TOP - FIT_MARGIN - DOC_UNITS * scale) / 2;
  Object.assign(ED.view, { scale, ox: (cv.clientWidth - DOC_UNITS * scale) / 2, oy, fit: true });
  renderEditor();
}

// Zooms by a factor, keeping the point under (sx, sy) in place (the middle if not given).
// From a quarter of the fitted size to 40 times it.
function zoomAt(f, sx, sy) {
  const cv = $("ed-canvas"), v = ED.view, fit = fitScale();
  sx ??= cv.clientWidth / 2;
  sy ??= cv.clientHeight / 2;
  const scale = Math.min(fit * 40, Math.max(fit / 4, v.scale * f));
  v.ox = sx - ((sx - v.ox) / v.scale) * scale;
  v.oy = sy - ((sy - v.oy) / v.scale) * scale;
  v.scale = scale;
  v.fit = false;
  renderEditor();
}

let edFrame = 0;
function renderEditor() {
  if (!edFrame) edFrame = requestAnimationFrame(() => {
    edFrame = 0;
    drawEditor();
    if (ED.mode === "motion" && document.body.classList.contains("shapes")) renderEditor(); // keep playing
  });
}

// ---- Draw / Motion -------------------------------------------------------------

function setMode(mode) {
  ED.mode = mode;
  $("shapes-view").querySelector(".ed-tools").dataset.mode = mode;
  document.querySelector(".ed-toolbar").classList.toggle("motion", mode === "motion");
  for (const b of document.querySelectorAll("[data-mode]")) b.classList.toggle("on", b.dataset.mode === mode);
  if (mode === "motion") { dropSelection(); ED.cur = null; replayPreview(); renderMotions(); }
  edUI();
  renderEditor();
}

// The preview follows the song while it plays. Paused, it runs on by itself
// from the playhead, so claps and bongos show where the song has them.
const PREVIEW = { at: 0, from: 0, start: 0 };
function previewBeats() {
  if (source.playing) return msToBeats(SCORE, songNow());
  return (PREVIEW.from + (performance.now() - PREVIEW.at) / beatMs(SCORE)) % songBeats(SCORE);
}

function replayPreview() {
  PREVIEW.at = performance.now();
  PREVIEW.from = Math.max(0, msToBeats(SCORE, songNow()));
  PREVIEW.start = previewBeats();
}

// The motion frame for the preview's one spot. The entrance plays again every 8 bars.
function previewFrame(s) {
  const moves = { box: unionBox(shownItems()), parts: {}, half: DOC_UNITS / 2 };
  for (const p of ED.doc.parts) { const b = !p.hidden && unionBox(p.items); if (b) moves.parts[p.name] = b; }
  const loop = 8 * SCORE.beatsPerBar, age = (((s.B - PREVIEW.start) % loop) + loop) % loop;
  return motionFrame(ED.doc.motions ?? [], moves, s, age, 0);
}

const ON_LABELS = {
  enter: "when it comes in", beat: "every beat", bar: "every bar", claps: "claps", bongos: "bongos",
  keys: "held keys", energy: "energy", random: "now and then", always: "all the time",
};
const PARAM_LABELS = {
  beats: "length (beats)", stagger: "beats between spots", amount: "amount", decay: "settles (higher is quicker)",
  everyBars: "about every (bars)", speed: "speed", degrees: "degrees", turnsPerBar: "turns per bar", perBeat: "shakes per beat",
};

function fmtParam(v, step) { return Number(v).toFixed(decimals(step)); }

// One card per motion: what it does, what moves, what it follows, its sliders.
function renderMotions() {
  if (!ED.doc) return;
  const parts = ["all", ...ED.doc.parts.map((p) => p.name)];
  $("ed-motions").innerHTML = (ED.doc.motions ?? []).map((m, i) => {
    const def = MOTIONS[m.do];
    const menu = (key, opts, title) => `<select class="input" data-i="${i}" data-key="${key}" title="${title}">` +
      opts.map(([v, t]) => `<option value="${v}"${String(m[key]) === String(v) ? " selected" : ""}>${t}</option>`).join("") + `</select>`;
    const sliders = Object.entries(def.params)
      .filter(([k]) => (k !== "decay" || KICKS.includes(m.on)) && (k !== "everyBars" || m.on === "random"))
      .map(([k, [, min, max, step]]) => `<label class="param flush"><span>${PARAM_LABELS[k] ?? k}</span><span class="val">${fmtParam(m[k], step)}</span>` +
        `<input type="range" data-i="${i}" data-key="${k}" min="${min}" max="${max}" step="${step}" value="${m[k]}"></label>`).join("");
    return `<div class="motion">` +
      `<div class="motion-head">${menu("do", Object.entries(MOTIONS).map(([k, d]) => [k, d.label]), "Motion")}` +
      `<button class="mini" data-i="${i}" data-act="del" title="Remove">×</button></div>` +
      `<div class="motion-row">${menu("part", parts.map((p) => [p, p === "all" ? "whole shape" : p]), "What moves")}` +
      `${menu("on", def.ons.map((o) => [o, ON_LABELS[o]]), "What it follows")}</div>` +
      (def.pivot ? menu("pivot", PIVOTS.map((p) => [p, `from the ${p}`]), "Where it scales or turns from") : "") +
      `<span class="data dimmed">${MOTION_NOTES[m.do]}</span>${sliders}</div>`;
  }).join("") || `<span class="data dimmed">No motions yet: the shape sits still.</span>`;
}

function edPalette() { return paletteAt(SCORE, msToBeats(SCORE, songNow())); }

function drawEditor() {
  const cv = $("ed-canvas");
  if (!ED.doc || !document.body.classList.contains("shapes")) return;
  const moving = ED.mode === "motion", s = moving ? frameState(SCORE, WORLD, previewBeats()) : null;
  const v = ED.view, dpr = cv.width / cv.clientWidth, col = moving ? s.col : edPalette(), one = 1 / v.scale; // one screen pixel
  const ctx = cv.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0d0d0d"; // around the shape's box
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
  $("ed-zoom-fit").textContent = `${Math.round((v.scale / fitScale()) * 100)}%`;
  ctx.fillStyle = col.ground;
  ctx.fillRect(0, 0, DOC_UNITS, DOC_UNITS);
  if (!moving) drawPhoto(ctx);
  // the guide: one spot's circle and its center
  ctx.save();
  ctx.strokeStyle = rgba(col.ink, 0.3);
  ctx.lineWidth = one;
  ctx.setLineDash([6 * one, 6 * one]);
  ctx.beginPath();
  ctx.arc(500, 500, 500 - one, 0, 2 * Math.PI);
  ctx.moveTo(490, 500); ctx.lineTo(510, 500);
  ctx.moveTo(500, 490); ctx.lineTo(500, 510);
  ctx.stroke();
  ctx.restore();
  if (moving) {
    drawMoving(ctx, s, col);
    cv.style.cursor = ED.pan ? "grabbing" : ED.hand ? "grab" : "default";
    return;
  }
  for (const part of ED.doc.parts) if (!part.hidden) for (const it of part.items) drawItem(ctx, it, col);
  // the line being drawn, straight from the pen; the line it's redrawing, marked
  if (ED.cur && ED.cur.raw.length) {
    const pts = ED.cur.pen ? ED.cur.raw : speedPressure(ED.cur.raw, ED.size), o = ED.toolOpts;
    if (ED.cur.over) {
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2 * one;
      ctx.stroke(itemPath(ED.cur.over.item));
      ctx.restore();
    }
    ctx.fillStyle = slotColor(ED.slot ?? "ink", col);
    ctx.fill(new Path2D(outlineD(window.getStroke
      ? getStroke(pts, { ...strokeOptions(ED.size, o.taper, o.ends, false), streamline: 0.5 })
      : evenOutline(pts, ED.size))));
  }
  drawToolMarks(ctx);
  // the brush or eraser under the pointer
  const drawing = (ED.tool === "pencil" || ED.tool === "eraser") && !ED.hand;
  cv.style.cursor = ED.pan ? "grabbing" : ED.hand ? "grab" : drawing ? "none" : toolCursor(ED.hover);
  if (ED.hover && drawing) {
    ctx.strokeStyle = rgba(col.ink, 0.6);
    ctx.lineWidth = one;
    ctx.beginPath();
    ctx.arc(ED.hover[0], ED.hover[1], ED.tool === "eraser" ? 8 : ED.size / 2, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

// The shape as it moves now, and where in the song that is.
function drawMoving(ctx, s, col) {
  const frame = previewFrame(s), count = allItems().length, bar = Math.floor(Math.max(0, s.B) / s.bpb) + 1;
  setText("ed-motion-pos", `bar ${bar} · beat ${Math.floor(Math.max(0, s.B) % s.bpb) + 1} · ${source.playing ? "with the song" : "preview from the playhead"}`);
  if (frame.hidden) return;
  let i = 0;
  for (const part of ED.doc.parts) {
    if (part.hidden) { i += part.items.length; continue; }
    for (const it of part.items) {
      const fx = itemFx(frame, [part.name], i++, count);
      if (fx.a <= 0.001) continue;
      ctx.save();
      if (fx.m) ctx.transform(fx.m.a, fx.m.b, fx.m.c, fx.m.d, fx.m.e, fx.m.f);
      ctx.globalAlpha = fx.a;
      drawItem(ctx, it, col);
      ctx.restore();
    }
  }
}

function slotLabel(slot) { return slot.replace(/(\d)$/, " $1"); }

// The right-hand panel, matched to the shape.
function edUI() {
  if (!ED.doc) return;
  const col = edPalette(), parts = ED.doc.parts;
  if (document.activeElement !== $("ed-name")) $("ed-name").value = ED.name;
  const onSq = SCORE.layers.some((R) => R.clips.some((c) => c.shape === ED.name));
  $("ed-to-square").textContent = onSq ? "Show on square" : "Add to square";
  for (const b of document.querySelectorAll("[data-tool]")) b.classList.toggle("on", b.dataset.tool === ED.tool);
  // the toolbar's Shape button names the shape tool in use
  const shapeTool = SHAPE_TOOLS[ED.tool];
  $("ed-shape-btn").textContent = `${shapeTool ? shapeTool[0].toUpperCase() + shapeTool.slice(1) : "Shape"} ▾`;
  $("ed-shape-btn").classList.toggle("on", !!shapeTool);
  // the panel shows the tool in use and only its options; with a selection, the selection's
  const drawsNew = ED.tool === "pencil" || !!shapeTool;
  $("ed-tool-section").hidden = selecting();
  $("ed-tool-label").textContent = shapeTool ?? { select: "Select", points: "Points", pencil: "Pencil", eraser: "Eraser", photo: "Photo" }[ED.tool];
  $("ed-style").hidden = !drawsNew;
  $("ed-redraw-row").hidden = ED.tool !== "pencil";
  $("ed-redraw").checked = ED.redraw;
  // the photo and auto-trace
  const ph = ED.photo;
  $("ed-photo-opts").hidden = ED.tool !== "photo";
  $("ed-photo-place").hidden = !ph;
  for (const id of ["ed-photo-fit", "ed-photo-hide", "ed-photo-remove"]) $(id).hidden = !ph;
  $("ed-photo-pick").textContent = ph ? "Other photo" : "Choose photo";
  if (ph) {
    $("ed-photo-hide").textContent = ph.hidden ? "Show" : "Hide";
    for (const input of document.querySelectorAll("[data-photo]")) {
      const v = input.dataset.photo === "w" ? (ph.w / DOC_UNITS) * 100 : ph[input.dataset.photo];
      if (document.activeElement !== input) input.value = v;
      input.closest("label").querySelector(".val").textContent = fmtParam(v, Number(input.step));
    }
  }
  for (const input of document.querySelectorAll("[data-trace]")) {
    const v = ED.traceOpts[input.dataset.trace];
    if (document.activeElement !== input) input.value = v;
    input.closest("label").querySelector(".val").textContent = v;
  }
  $("ed-trace-show").checked = ED.traceOpts.show;
  $("ed-new-fill-row").hidden = OPEN_SHAPES.has(ED.tool); // a line or an arrow has no inside
  // the selection: how many, which part, copy, delete
  $("ed-sel-section").hidden = !selecting();
  if (selecting()) {
    const inParts = new Set(ED.sel.map(partOf));
    const pr = selProps();
    $("ed-sel-count").textContent = `${ED.sel.length} line${ED.sel.length > 1 ? "s" : ""} selected` +
      (pr.fill === "drawn" || pr.line === "drawn" ? " · a color as drawn has no swatch marked" : "");
    paintSwatches($("ed-fill"), pr.fill, col);
    paintSwatches($("ed-line"), pr.line, col);
    $("ed-line").querySelector(".none").hidden = !pr.paths; // pencil lines always have a line
    if (document.activeElement !== $("ed-weight")) $("ed-weight").value = pr.weight;
    $("ed-weight-val").textContent = round1(pr.weight);
    // pencil lines: pressure and pointed ends
    $("ed-sel-strokes").hidden = !pr.strokes.length;
    if (pr.strokes.length) {
      const first = pr.strokes[0];
      for (const [id, v] of [["ed-taper", first.taper ?? 0.6], ["ed-ends", first.ends ?? 0]]) {
        if (document.activeElement !== $(id)) $(id).value = v;
        $(`${id}-val`).textContent = fmtParam(v, 0.05);
      }
    }
    $("ed-sel-part").innerHTML = (inParts.size > 1 ? `<option value="">several parts</option>` : "") +
      parts.map((p, i) => `<option value="${i}"${inParts.size === 1 && inParts.has(p) ? " selected" : ""}>in ${p.name}</option>`).join("");
  }
  $("ed-fewer").parentElement.hidden = !(ED.tool === "points" && ED.target);
  $("ed-fewer").hidden = false;
  $("ed-undo").disabled = !ED.history.length;
  $("ed-redo").disabled = !ED.future.length;
  $("ed-size").value = ED.size;
  $("ed-size-val").textContent = ED.size;
  paintSwatches($("ed-slots"), ED.slot ?? "none", col);
  paintSwatches($("ed-new-fill"), ED.fillSlot ?? "none", col);
  $("ed-slots").querySelector(".none").hidden = ED.tool === "pencil" || OPEN_SHAPES.has(ED.tool); // these are all line
  for (const row of document.querySelectorAll("[data-for]")) {
    row.hidden = row.dataset.for !== ED.tool;
    const input = row.querySelector("input"), v = ED.toolOpts[input.dataset.opt];
    if (document.activeElement !== input) input.value = v;
    row.querySelector(".val").textContent = fmtParam(v, Number(input.step));
  }
  // parts, top first
  $("ed-parts").innerHTML = parts.map((p, i) => i).reverse().map((i) => {
    const p = parts[i], name = ED.renaming === i
      ? `<input class="input" type="text" value="${p.name}" spellcheck="false" autocomplete="off">`
      : `<span>${p.name}</span>`;
    const picked = ED.tool === "select" && p.items.length && p.items.every((it) => ED.sel.includes(it));
    return `<div class="part-row${i === ED.part ? " on" : ""}${picked ? " picked" : ""}${p.hidden ? " off" : ""}" data-i="${i}" draggable="${ED.renaming === i ? "false" : "true"}">` +
      `<span class="grip" title="Drag to move up or down">⋮⋮</span>${name}` +
      `<span class="dimmed">${p.items.length}</span>` +
      `<button class="mini eye" data-act="eye" title="${p.hidden ? "Show" : "Hide"} (hidden parts are hidden on the square too)">${p.hidden ? EYE_OFF : EYE}</button>` +
      `<button class="mini" data-act="del" title="Delete the part and its lines">×</button></div>`;
  }).join("");
  const input = $("ed-parts").querySelector("input");
  if (input) {
    input.focus();
    input.select();
    const done = (keep) => {
      if (ED.renaming == null) return;
      const i = ED.renaming, name = cleanName(input.value);
      ED.renaming = null;
      if (keep && name && name !== parts[i].name && !parts.some((p) => p.name === name)) {
        remember();
        for (const m of ED.doc.motions ?? []) if (m.part === parts[i].name) m.part = name;
        parts[i].name = name;
        renderMotions();
      }
      edUI();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); e.stopPropagation(); });
    input.addEventListener("blur", () => done(true));
  }
  // imported colors and the palette slot each one follows
  const seen = new Map();
  for (const p of parts) for (const it of p.items) {
    if (it.kind !== "path") continue;
    if (it.fill) seen.set(it.fill, seen.get(it.fill) ?? it.fillSlot ?? "");
    if (it.stroke && it.width > 0) seen.set(it.stroke, seen.get(it.stroke) ?? it.strokeSlot ?? "");
  }
  $("ed-colors-section").hidden = !seen.size;
  $("ed-colors").innerHTML = [...seen].map(([hex, slot]) =>
    `<label class="paint"><span class="chip" style="background:${hex}"></span><span>${hex}</span><select class="input" data-hex="${hex}">` +
    `<option value="">as drawn</option>${PAINT_SLOTS.map((s) => `<option value="${s}"${s === slot ? " selected" : ""}>${slotLabel(s)}</option>`).join("")}` +
    `</select></label>`).join("");
  const points = ED.target ? subsOf(ED.target).reduce((n, s) => n + s.nodes.length, 0) : 0;
  const into = parts[ED.part]?.name;
  $("ed-cursor-note").textContent = {
    select: "Click a line, or drag a box around several. Then drag to move, a corner to scale, the knob to turn.",
    points: ED.target
      ? `${points} points · ${ED.nodesSel.size} selected. Drag points or handles; Alt bends one side. Double-click a point for smooth or corner, the line to add a point.`
      : "Click a line to show its points.",
    pencil: `Draws into ${into}.`,
    photo: ph
      ? "Drag to move the photo, arrows to nudge. Only what's inside the box is traced: size and place it so the sketch you want fills it."
      : "Put a photo of a paper sketch under the drawing, to trace by hand or auto-trace. You can also drop one on the canvas.",
    eraser: "Drag across lines to remove them.",
    ...Object.fromEntries(Object.keys(SHAPE_TOOLS).map((k) => [k,
      `Drag to draw, into ${into}; a click makes one. Shift: ${OPEN_SHAPES.has(k) ? "45° steps" : "even sides"}${OPEN_SHAPES.has(k) ? "" : ". Alt: from the middle"}.`])),
  }[ED.tool];
}

function edStatus(text) { $("ed-status").textContent = text; }

// ---- Saving ------------------------------------------------------------------

async function saveShape() {
  const name = cleanName(ED.name);
  if (!name) return edStatus("Name the shape first");
  const text = docToSVG(ED.doc, edPalette());
  let where;
  try {
    const dir = await shapesDir();
    if (dir) {
      const file = await dir.getFileHandle(`${name}.svg`, { create: true });
      const w = await file.createWritable();
      await w.write(text);
      await w.close();
      where = `Saved shapes/${name}.svg`;
    } else {
      downloadText(text, `${name}.svg`);
      where = `Downloaded ${name}.svg: move it into shapes/`;
    }
  } catch (e) {
    return edStatus(e.name === "AbortError" ? "Not saved" : e.message);
  }
  // the square shows it now, without waiting to read the file back
  Object.assign((SHAPES[name] ??= {}), parseShape(text), { status: "ok", error: null, text });
  ED.dirty = false;
  edStatus(where);
  refreshLibrary();
  edUI();
}

// Deletes the shape after asking. Its file moves to shapes/deleted/ (move it
// back into shapes/ to get it back), and layers that use it leave the square.
async function deleteShape() {
  const name = ED.name, layers = SCORE.layers.reduce((n, R) => n + R.clips.filter((c) => c.shape === name).length, 0);
  let onDisk = false;
  try { onDisk = (await fetch(`shapes/${encodeURIComponent(name)}.svg`, { method: "HEAD", cache: "no-cache" })).ok; } catch {}
  const ask = [`Delete "${name}"?`];
  if (onDisk) ask.push(`Its file moves to shapes/deleted/, so you can get it back.`);
  if (layers) ask.push(`It's on the square ${layers > 1 ? `${layers} times` : "once"}, which ${layers > 1 ? "all go" : "goes"} too.`);
  if (!confirm(ask.join("\n\n"))) return;
  let note = `Deleted ${name}`;
  if (onDisk) {
    try {
      const dir = await shapesDir();
      if (!dir) note = `Removed ${name} here; this browser can't change files, so delete shapes/${name}.svg by hand`;
      else {
        const text = await (await (await dir.getFileHandle(`${name}.svg`)).getFile()).text();
        const bin = await dir.getDirectoryHandle("deleted", { create: true });
        let keep = `${name}.svg`;
        try { await bin.getFileHandle(keep); keep = `${name}-${Date.now()}.svg`; } catch {} // one deleted earlier stays too
        const w = await (await bin.getFileHandle(keep, { create: true })).createWritable();
        await w.write(text);
        await w.close();
        await dir.removeEntry(`${name}.svg`);
        note = `Deleted ${name}: it's in shapes/deleted/${keep}`;
      }
    } catch (e) {
      return edStatus(e.name === "AbortError" ? "Not deleted" : `Not deleted: ${e.message}`);
    }
  }
  if (layers) {
    rememberScore();
    for (const R of SCORE.layers) for (let ci = R.clips.length - 1; ci >= 0; ci--) if (R.clips[ci].shape === name) R.clips.splice(ci, 1);
    EDIT.clip = null;
    buildLayers();
    note += ". Its clips are off the square: Copy score.js to keep it that way";
  }
  delete SHAPES[name];
  delete ED.drafts[name];
  Object.assign(ED, { name: "", doc: null, dirty: false });
  await refreshLibrary();
  await openShape(ED.library[0] ?? newShapeName());
  refreshLibrary();
  edStatus(note);
}

// Puts the shape on the square (a new layer from the current bar if none uses
// it yet) and switches to the square with it ready to place.
function shapeToSquare() {
  if (!SHAPES[ED.name]?.items) return edStatus("Save it first");
  let at = null;
  SCORE.layers.forEach((R, ri) => R.clips.forEach((c, ci) => { at ??= c.shape === ED.name ? { ri, ci } : null; }));
  at ??= addShapeLayer(ED.name);
  setView("square");
  setEdit(true, at.ri, at.ci);
}

function downloadText(text, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// The shapes folder, to write into. Chrome asks once which folder that is (the
// sound-square folder, or shapes/ in it) and the studio remembers it. Null where
// the browser can't write files: saving downloads instead.
let SHAPES_DIR = null;
async function shapesDir() {
  if (!window.showDirectoryPicker) return null;
  SHAPES_DIR ??= await handleStore("get", "shapesDir");
  if (SHAPES_DIR && (await SHAPES_DIR.queryPermission({ mode: "readwrite" })) !== "granted"
      && (await SHAPES_DIR.requestPermission({ mode: "readwrite" })) !== "granted") SHAPES_DIR = null;
  if (!SHAPES_DIR) {
    const picked = await showDirectoryPicker({ id: "sound-square", mode: "readwrite" });
    if (picked.name === "shapes") SHAPES_DIR = picked;
    else {
      try { await picked.getFileHandle("score.js"); } catch { throw new Error("Pick the sound-square folder (it has score.js)"); }
      SHAPES_DIR = await picked.getDirectoryHandle("shapes", { create: true });
    }
    await handleStore("put", "shapesDir", SHAPES_DIR);
  }
  return SHAPES_DIR;
}

// Folder handles can only be kept in IndexedDB. Fails quietly: the studio just asks again.
function handleStore(op, key, value) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("soundsquare", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const tx = req.result.transaction("handles", op === "get" ? "readonly" : "readwrite").objectStore("handles");
        const r = op === "get" ? tx.get(key) : tx.put(value, key);
        r.onsuccess = () => resolve(op === "get" ? r.result ?? null : true);
        r.onerror = () => resolve(null);
      };
    } catch { resolve(null); }
  });
}
