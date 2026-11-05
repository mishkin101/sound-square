// sound-square studio: plays the score against a song position, draws the
// square, and lets you tune each layer while it runs. The position comes from
// a source: the stand-in clock, a song file, or Spotify (see sources.js and
// spotify.js). Everything else works the same whichever one is playing.

let WORLD;            // the score, prepared (see prepare in engine.js)
let source = StandIn; // where the song position comes from
let scrubMs = null;   // while dragging the timeline: the position under the mouse
let ACTIVE = {};      // which clips are on this frame: row index -> set of clip indexes
let LAYER_BOXES = []; // their boxes in the side panel
// Edit mode (E): drag a layer's spots on the square. `layer` is the layer being
// edited, `spot` the selected spot, `drag` what the mouse is doing to it.
const EDIT = { on: false, layer: null, clip: null, spot: null, drag: null };
let SQ_X = 0, SQ_Y = 0; // the square's top-left corner on the canvas
let scrubbing = false;
const MARGIN = 24;    // space around the square
const TL_PAD = 16;    // timeline side padding

function songNow() { return scrubMs ?? source.now(); }

// Playing or scrubbing: the song is moving, so playback wins over Edit.
function liveNow() { return source.playing || scrubMs != null; }

// Runs a source action; if it fails, the reason shows in the Song panel.
function run(action, src = source) {
  Promise.resolve().then(action).catch((e) => { src.label = e.message; });
}

// ---- p5 ----------------------------------------------------------------------

function setup() {
  restoreWork(); // edits made in the studio survive a reload
  const signingIn = restoreAfterSignIn();
  WORLD = prepare(SCORE);
  const r = stageRect();
  const cnv = createCanvas(r.width, r.height);
  cnv.parent("stage");
  cnv.elt.addEventListener("wheel", tlWheel, { passive: false });
  noiseSeed(7);
  textFont("Menlo");
  buildPanel();
  wireControls();
  wireSong(signingIn ? "spotify" : "standIn");
  wireListen();
  setInterval(followSong, 1000);
  setInterval(keepWork, 2000);
  window.addEventListener("pagehide", keepWork);
  wireEditor();
  // drawings load in the background; coming back to this window picks up any you changed
  loadShapes();
  refreshLibrary();
  window.addEventListener("focus", () => { loadShapes(); refreshLibrary(); });
}

function windowResized() {
  const r = stageRect();
  resizeCanvas(r.width, r.height);
}

function stageRect() {
  const r = document.getElementById("stage").getBoundingClientRect();
  return { width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) };
}

function draw() {
  if (source.durationMs) coverSong(source.durationMs);
  else if (source.loops && source.now() >= songMs(SCORE)) source.seek(0); // the stand-in loops
  const B = msToBeats(SCORE, songNow());
  const tl = timelineHeight();
  background(0);
  SQ = Math.max(64, Math.floor(Math.min(width, height - tl) - 2 * MARGIN));
  SQ_X = Math.round((width - SQ) / 2);
  SQ_Y = Math.round((height - tl - SQ) / 2);
  renderSquare(B, SQ_X, SQ_Y);
  drawMarkPath();
  drawMarkFx();
  drawMomentPath();
  if (MOMENT_MODE) { // say so on the square itself, not just the panel
    textSize(11); textAlign(CENTER, TOP); noStroke();
    fill("#55d187");
    text("MOMENT MODE — tap, hold or draw what you hear · M leaves", SQ_X + SQ / 2, SQ_Y + 8);
  }
  if (editing() && hasSpots(editLayer()) && !liveNow()) drawEditOverlay();
  else if (editing()) setText("sq-edit-hint", scrubMs != null ? "scrubbing — the keys play" : "playing — pause to drag");
  if (tl) drawTimeline(B, height - tl);
  // no preview clicks while listening: they'd be heard too and pull the beat toward the old grid
  Sound.update(SCORE, WORLD, B, source.playing && scrubMs == null && !Listen.on);
  updatePanel(B);
}

// Once the real song's length is known, the score runs to its end.
function coverSong(durationMs) {
  SCORE.bars = Math.max(1, Math.ceil(msToBeats(SCORE, durationMs) / SCORE.beatsPerBar));
}

// ---- The square --------------------------------------------------------------

function renderSquare(B, x, y) {
  const s = frameState(SCORE, WORLD, B);
  ACTIVE = {};
  push();
  translate(x, y);
  scale(SQ);
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, 0, 1, 1);
  drawingContext.clip();
  SCORE.layers.forEach((R, ri) => {
    if (R.hidden) return;
    R.clips.forEach((L, ci) => {
      const el = elementOf(L);
      if (!el) return;
      const picked = ri === EDIT.layer && ci === EDIT.clip && !liveNow();
      // the clip being edited shows fully, wherever the song is; while the song
      // plays or scrubs, playback wins, so keyed motion shows with Edit still on
      const st = editing() && picked
        ? { T: layerTiming(SCORE, WORLD, L), vis: 1, clip: null, age: 1e4, local: 1e4 }
        : el.always
        ? { T: layerTiming(SCORE, WORLD, L), vis: 1, clip: null, age: Math.max(0, B), local: Math.max(0, B) }
        : layerState(SCORE, WORLD, L, B);
      if (!st || st.vis <= 0.001) return;
      (ACTIVE[ri] ??= new Set()).add(ci);
      push();
      drawingContext.globalAlpha = st.vis;
      if (st.clip) {
        drawingContext.beginPath();
        drawingContext.rect(0, st.clip[0], 1, st.clip[1] - st.clip[0]);
        drawingContext.clip();
      }
      const P = paramsFor(el, L);
      if (editing() && picked) { P.spotsMode = "all"; P.editing = true; } // place the spots while editing
      el.draw(P, s, st);
      pop();
    });
  });
  drawClapLines(B, s);
  drawFlash(B);
  drawingContext.restore();
  pop();
}

// A layer's values: what score.js sets, defaults from elements.js for the rest.
function paramsFor(el, L) {
  const P = {};
  for (const [k, def] of Object.entries(el.params)) P[k] = L[k] ?? def[0];
  if (el.spots) P.spots = L.spots ?? el.spots;
  if (L.shape) P.shape = L.shape;
  for (const k of ["spotsMode", "moveOn", "thenEvery", "moveBars", "switchBy", "keys"]) if (L[k] != null) P[k] = L[k];
  return P;
}

// The line that sweeps down the square during a "clap" change.
function drawClapLines(B, s) {
  const seen = new Set();
  for (const L of SCORE.layers.flatMap((R) => R.clips)) {
    const T = layerTiming(SCORE, WORLD, L);
    for (const [type, at, len] of [[T.inType, T.inAt, T.inLen], [T.outType, T.outAt, T.outLen]]) {
      if (type !== "clap" || B < at || B >= at + len || seen.has(at)) continue;
      seen.add(at);
      const y = ease((B - at) / len);
      stroke(s.col.ink); strokeWeight(px(4)); strokeCap(SQUARE);
      line(0, y, 1, y);
    }
  }
}

// ---- Timeline ----------------------------------------------------------------
// Bars, sections, one row per layer, and the events: bongos, claps, held keys.

// On short windows the layer rows are left out so the square keeps its room.
function timelineHeight() {
  if (document.body.classList.contains("bare")) return 0;
  return showLayerRows() ? 104 + SCORE.layers.length * 13 : 100;
}

function showLayerRows() { return height >= 640; }

// The timeline spans the song in milliseconds, so anything before bar 1 shows
// too. It can zoom in (pinch or ⌘-scroll over it, toward the pointer; scroll
// pans; double-click fits the song again), and follows the playhead when zoomed.
const TL_VIEW = { zoom: 1, startMs: 0 };

function tlSpanMs() { return songMs(SCORE) / TL_VIEW.zoom; }

function clampTlView() {
  TL_VIEW.zoom = constrain(TL_VIEW.zoom, 1, 64);
  TL_VIEW.startMs = constrain(TL_VIEW.startMs, 0, Math.max(0, songMs(SCORE) - tlSpanMs()));
}

function tlWheel(e) {
  const tl = timelineHeight();
  if (!tl || e.offsetY < height - tl) return;
  e.preventDefault();
  const w = width - 2 * TL_PAD, frac = constrain((e.offsetX - TL_PAD) / w, 0, 1);
  if (e.ctrlKey || e.metaKey) { // pinch or ⌘-scroll: zoom toward the pointer
    const atMs = TL_VIEW.startMs + frac * tlSpanMs();
    TL_VIEW.zoom = constrain(TL_VIEW.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), 1, 64);
    TL_VIEW.startMs = atMs - frac * tlSpanMs();
  } else {
    TL_VIEW.startMs += ((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / w) * tlSpanMs();
  }
  clampTlView();
}

function timelineX(beats) {
  return TL_PAD + ((beatsToMs(SCORE, beats) - TL_VIEW.startMs) / tlSpanMs()) * (width - 2 * TL_PAD);
}

function drawTimeline(B, top) {
  const X = timelineX, total = songBeats(SCORE);
  // when zoomed, keep the playing song in view
  if (source.playing && scrubMs == null && TL_VIEW.zoom > 1) {
    const ms = songNow();
    if (ms < TL_VIEW.startMs || ms > TL_VIEW.startMs + tlSpanMs()) {
      TL_VIEW.startMs = ms - 0.1 * tlSpanMs();
      clampTlView();
    }
  }
  stroke(38); strokeWeight(1);
  line(0, top + 0.5, width, top + 0.5);
  textSize(10); textAlign(LEFT, TOP);

  // ruler: a tick per bar, a number every 8 bars
  let y = top + 12;
  for (let bar = 1; bar <= SCORE.bars + 1; bar++) {
    const x = Math.round(X(barToBeats(SCORE, bar))) + 0.5;
    stroke(bar % 4 === 1 ? 90 : 45);
    line(x, y + 12, x, y + 16);
    const every = TL_VIEW.zoom >= 8 ? 1 : TL_VIEW.zoom >= 2 ? 4 : 8;
    if (bar % every === 1 % every && bar <= SCORE.bars) { noStroke(); fill(140); text(bar, x + 3, y); }
  }

  // moments: a marker per hit, named at the first; hidden ones stay off the ruler
  y += 22;
  let hover = null;
  if (!HIDE_MOMENTS) (SCORE.moments || []).forEach((m, mi) => {
    if (m.hide) return;
    if (m.hold) { // a hold is a band, dragged at its ends or as a whole
      const a = X(m.hold[0]), b = X(m.hold[1]);
      const picked = MOMENT_DRAG && MOMENT_DRAG.mi === mi;
      noStroke(); fill(picked ? "#ffffff" : momentColor(mi));
      rect(a, y + 4, Math.max(2, b - a), 7);
      fill(140); text(m.name, a + 3, y - 1);
      if (mouseX >= a - 5 && mouseX <= b + 5 && mouseY >= y && mouseY <= y + 13) {
        hover = `${m.name} · ${round2(m.hold[1] - m.hold[0])} beats${m.note ? ` · ${m.note}` : ""}`;
      }
      return;
    }
    (m.hits || []).forEach((h, hi) => {
      const x = X(h), picked = MOMENT_DRAG && MOMENT_DRAG.mi === mi && MOMENT_DRAG.hi === hi;
      noStroke(); fill(picked ? "#ffffff" : momentColor(mi));
      triangle(x - 4, y + 4, x + 4, y + 4, x, y + 11);
      if (hi === 0) { fill(140); text(m.name, x + 6, y); }
      if (Math.abs(mouseX - x) <= 5 && mouseY >= y && mouseY <= y + 13) hover = m.note ? `${m.name} · ${m.note}` : m.name;
    });
  });

  // sections
  y += 16;
  SCORE.sections.forEach((sec, i) => {
    const next = SCORE.sections[i + 1];
    const a = barToBeats(SCORE, sec.from), b = next ? barToBeats(SCORE, next.from) : total;
    const on = B >= a && B < b;
    noStroke(); fill(on ? 38 : 13);
    rect(X(a), y, X(b) - X(a) - 1, 16);
    fill(on ? 255 : 140);
    let label = `${i + 1} ${sec.name.toUpperCase()}`;
    while (label.length > 1 && textWidth(label) > X(b) - X(a) - 10) label = label.slice(0, -1);
    text(label, X(a) + 5, y + 4);
  });

  // layers as clips: drag the body to move one, an end to trim it. Ends snap
  // to bars and to moments; landing on a moment attaches the end to it (a ▾).
  y += 24;
  if (showLayerRows()) {
    TL_ROWS_Y = y;
    SCORE.layers.forEach((R, ri) => {
      R.clips.forEach((L, ci) => {
        const T = layerTiming(SCORE, WORLD, L), a = X(T.s), b = X(T.e);
        const sel = ri === EDIT.layer && ci === EDIT.clip, on = !R.hidden && ACTIVE[ri]?.has(ci);
        noStroke(); fill(R.hidden ? 38 : on ? 217 : sel ? 110 : 64);
        rect(a, y + 2, Math.max(2, b - a - 1), 9);
        // fades show as sloped ends
        fill(0);
        if (T.inType === "fade" && T.inLen > 0) triangle(a, y + 2, Math.min(X(T.inAt + T.inLen), b) - 1, y + 2, a, y + 10);
        if (T.outType === "fade" && T.outLen > 0) triangle(b - 1, y + 2, Math.max(X(T.outAt), a), y + 2, b - 1, y + 10);
        // an end attached to a moment carries its marker
        fill(sel ? 255 : 190);
        if (typeof L.from === "string") triangle(a - 3, y, a + 3, y, a, y + 5);
        if (typeof L.to === "string") triangle(b - 4, y, b + 2, y, b - 1, y + 5);
        if (sel) { noFill(); stroke(255); strokeWeight(1); rect(a - 0.5, y + 1.5, b - a, 10); noStroke(); }
        // the picked clip's keyframes, as diamonds
        if (sel) (L.keys ?? []).forEach((k, ki) => {
          const kx = X(keyBeat(SCORE, k.at));
          const held = KEY_DRAG && KEY_DRAG.ri === ri && KEY_DRAG.ci === ci && KEY_DRAG.ki === ki;
          noStroke(); fill(held ? 255 : 0); stroke(255); strokeWeight(1);
          quad(kx, y + 1.5, kx + 4.5, y + 6, kx, y + 10.5, kx - 4.5, y + 6);
          noStroke();
          if (!KEY_DRAG && Math.abs(mouseX - kx) <= 4 && mouseY >= y && mouseY < y + 13) hover = `key · ${atKeyWords(k.at)}`;
        });
        const nm = clipLabel(R, ci);
        if (textWidth(nm) < b - a - 10) { fill(on ? 0 : 200); text(nm, a + 4, y + 3); }
        else { fill(140); text(nm, b + 5, y + 3); }
        if (!CLIP_DRAG && mouseY >= y && mouseY < y + 13 && mouseX >= a - 5 && mouseX <= b + 5) hover = `${R.name} › ${nm}  ${timeWords(L)}`;
        if (CLIP_DRAG && CLIP_DRAG.ri === ri && CLIP_DRAG.ci === ci) hover = `${R.name} › ${nm}  ${timeWords(L)}`;
      });
      if (!R.clips.length && ri === EDIT.layer) { noStroke(); fill(90); text(`${R.name}: empty · + shape… adds here`, X(0) + 4, y + 3); }
      y += 13;
    });
  }

  // events: bongos, claps, held keys
  y += 4;
  const ev = WORLD.tracks;
  strokeWeight(1);
  stroke(64);
  for (const t of ev.bongos?.hits || []) { const x = Math.round(X(t)) + 0.5; line(x, y, x, y + 4); }
  stroke(160);
  for (const t of ev.claps?.hits || []) { const x = Math.round(X(t)) + 0.5; line(x, y + 5, x, y + 9); }
  noStroke(); fill(160);
  for (const h of ev.keys?.holds || []) rect(X(h.s), y + 11, Math.max(1, X(h.e) - X(h.s) - 1), 3);

  // playhead
  const head = X(B);
  stroke(255); strokeWeight(2);
  line(head, top + 8, head, y + 16);

  if (hover) {
    noStroke(); textAlign(LEFT, BOTTOM);
    fill(0); rect(mouseX + 8, mouseY - 20, textWidth(hover) + 10, 16);
    fill(255); text(hover, mouseX + 13, mouseY - 7);
  }
  if (!editing()) {
    const c = CLIP_DRAG ?? (inTimeline() && !scrubbing ? clipAt() : null);
    const overSq = mouseX >= SQ_X && mouseX <= SQ_X + SQ && mouseY >= SQ_Y && mouseY <= SQ_Y + SQ;
    const want = CLIP_DRAG ? (CLIP_DRAG.zone === "body" ? "grabbing" : "ew-resize")
      : KEY_DRAG ? "grabbing"
      : MOMENT_MODE && overSq ? "crosshair"
      : MOMENT_DRAG || (inTimeline() && (momentMarkerAt() || keyAt())) ? "grab"
      : c ? (c.zone === "body" ? "grab" : "ew-resize") : "default";
    if (canvasCursor !== want) cursor(canvasCursor = want);
  }
}

// The clip under the mouse: which layer, and whether an end or the body.
let TL_ROWS_Y = 0;
function clipAt() {
  if (!showLayerRows()) return null;
  const ri = Math.floor((mouseY - TL_ROWS_Y) / 13);
  if (ri < 0 || ri >= SCORE.layers.length || mouseY - TL_ROWS_Y - ri * 13 > 12) return null;
  const clips = SCORE.layers[ri].clips;
  for (let ci = clips.length - 1; ci >= 0; ci--) {
    const T = layerTiming(SCORE, WORLD, clips[ci]);
    const a = timelineX(T.s), b = timelineX(T.e);
    if (Math.abs(mouseX - a) <= 5) return { ri, ci, zone: "start" };
    if (Math.abs(mouseX - b) <= 5) return { ri, ci, zone: "end" };
    if (mouseX > a && mouseX < b) return { ri, ci, zone: "body" };
  }
  return null;
}

// Where a dragged end lands: a moment within reach attaches (its name), else
// the nearest bar line (in beats).
function snapBeat(beat) {
  const d = (b) => Math.abs(timelineX(b) - mouseX);
  let best = null;
  for (const m of SCORE.moments || []) {
    for (const h of m.hold ?? m.hits ?? []) if (d(h) <= 8 && (!best || d(h) < d(best.h))) best = { name: m.name, h };
  }
  return best ? best.name : Math.round(beat / SCORE.beatsPerBar) * SCORE.beatsPerBar;
}

function dragClip() {
  const d = CLIP_DRAG, L = SCORE.layers[d.ri].clips[d.ci], bpb = SCORE.beatsPerBar;
  const beat = msToBeats(SCORE, mouseMs());
  if (!d.kept) { rememberScore(); d.kept = true; }
  if (d.zone === "body") { // moving detaches both ends onto bars
    const bars = Math.round((beat - d.grab) / bpb), len = Math.max(1, Math.round((d.e - d.s) / bpb));
    L.from = constrain(Math.round(d.s / bpb) + 1 + bars, 1, SCORE.bars);
    L.to = constrain(L.from + len - 1, L.from, SCORE.bars);
    return;
  }
  const snap = snapBeat(beat);
  if (d.zone === "start") {
    if (typeof snap === "string") L.from = snap;
    else L.from = constrain(Math.round(snap / bpb) + 1, 1, typeof L.to === "number" ? L.to : SCORE.bars);
  } else if (typeof snap === "string") L.to = snap;
  else L.to = constrain(Math.round(snap / bpb), typeof L.from === "number" ? L.from : 1, SCORE.bars);
}

function inTimeline() {
  const tl = timelineHeight();
  return tl > 0 && mouseY >= height - tl && mouseY <= height && mouseX >= 0 && mouseX <= width;
}

// Dragging shows the square under the mouse; the song itself moves on release.
function mouseMs() {
  const frac = constrain((mouseX - TL_PAD) / (width - 2 * TL_PAD), 0, 1);
  return constrain(TL_VIEW.startMs + frac * tlSpanMs(), 0, songMs(SCORE));
}

let CLIP_DRAG = null;

function mousePressed(e) {
  if (inTimeline()) {
    MOMENT_DRAG = momentMarkerAt();
    if (MOMENT_DRAG) return;
    KEY_DRAG = keyAt();
    if (KEY_DRAG) return;
    const clip = clipAt();
    if (clip) {
      selectLayer(clip.ri, clip.ci, true);
      const T = layerTiming(SCORE, WORLD, SCORE.layers[clip.ri].clips[clip.ci]);
      CLIP_DRAG = { ...clip, s: T.s, e: T.e, grab: msToBeats(SCORE, mouseMs()) };
      return;
    }
    scrubbing = true;
    scrubMs = mouseMs();
    return;
  }
  if (onSquare(e) && MOMENT_MODE) return pressMark();
  if (onSquare(e) && DRAW_INTO != null && SCORE.moments?.[DRAW_INTO]) {
    pressMark();
    SQ_MARK.into = DRAW_INTO;
    return;
  }
  if (editing() && hasSpots(editLayer()) && onSquare(e) && !liveNow()) return pressSpot();
  if (onSquare(e)) {
    const [x, y] = squareMouse();
    const onPath = pathPointAt(x, y);
    if (onPath) {
      PATH_DRAG = { ...onPath, x, y, kept: false };
      return;
    }
    const hit = shapeOnSquare(x, y);
    if (hit) selectLayer(hit.ri, hit.ci, true);
  }
}
function mouseDragged() {
  if (SQ_MARK) dragMark();
  else if (PATH_DRAG) dragPath();
  else if (MOMENT_DRAG) dragMoment();
  else if (KEY_DRAG) dragKey();
  else if (CLIP_DRAG) dragClip();
  else if (scrubbing) scrubMs = mouseMs();
  else if (EDIT.drag) dragSpot();
}
function mouseReleased() {
  if (SQ_MARK) { releaseMark(); return; }
  if (PATH_DRAG) { releasePath(); return; }
  if (MOMENT_DRAG) { MOMENT_DRAG = null; momentsChanged(); return; }
  if (KEY_DRAG) {
    const L = SCORE.layers[KEY_DRAG.ri]?.clips?.[KEY_DRAG.ci];
    L?.keys?.sort((a, b) => keyBeat(SCORE, a.at) - keyBeat(SCORE, b.at));
    KEY_DRAG = null;
    buildLayers();
    return;
  }
  if (CLIP_DRAG) { CLIP_DRAG = null; buildLayers(); return; }
  if (scrubbing) { const ms = scrubMs; run(() => source.seek(ms)); scrubMs = null; }
  scrubbing = false;
  if (EDIT.drag?.kept) buildLayerDetail(); // a moved spot shows its new place in the list
  EDIT.drag = null;
}
function doubleClicked(e) {
  if (inTimeline()) { TL_VIEW.zoom = 1; TL_VIEW.startMs = 0; return; }
  if (editing() && hasSpots(editLayer()) && onSquare(e) && !liveNow() && !spotAt(...squareMouse())) addSpot(...squareMouse());
}

// ---- Edit mode ---------------------------------------------------------------
// Press E, then drag the spots of the open layer (the eyes) on the square:
// inside a spot moves it, its edge resizes it, double-click adds one, Delete
// removes the selected one. Clicking the number badges in turn sets the order
// they open in: the first one clicked becomes 1, the next 2, and so on.

function editing() { return EDIT.on && EDIT.layer != null && !document.body.classList.contains("bare"); }
function editLayer() { return SCORE.layers[EDIT.layer]?.clips?.[EDIT.clip]; }

// The layer's own spots, copied from the element's the first time they change.
function spotsOf(L) {
  if (!L.spots) L.spots = elementOf(L).spots.map((sp) => [...sp]);
  return L.spots;
}

function squareMouse() { return [(mouseX - SQ_X) / SQ, (mouseY - SQ_Y) / SQ]; }

function onSquare(e) {
  const [x, y] = squareMouse();
  return e?.target?.tagName === "CANVAS" && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

// Which spot is under (x, y), and whether that's its edge (resize) or inside (move).
function spotAt(x, y) {
  const L = editLayer(), P = paramsFor(elementOf(L), L), tol = 6 / SQ;
  for (let i = P.spots.length - 1; i >= 0; i--) {
    const [sx, sy, size] = P.spots[i], r = size * P.size, d = Math.hypot(x - sx, y - sy);
    if (Math.abs(d - r) <= tol) return { i, mode: "size" };
    if (d < r) return { i, mode: "move" };
  }
  return null;
}

// Where each spot's number badge sits on the canvas, in pixels.
function badgeOf([x, y, size], scale) {
  const r = size * scale * SQ;
  return [SQ_X + x * SQ + r * 0.71 + 6, SQ_Y + y * SQ - r * 0.71 - 6];
}

function badgeAt() {
  const L = editLayer(), P = paramsFor(elementOf(L), L);
  for (let i = P.spots.length - 1; i >= 0; i--) {
    const [bx, by] = badgeOf(P.spots[i], P.size);
    if (Math.abs(mouseX - bx) <= 9 && Math.abs(mouseY - by) <= 9) return i;
  }
  return -1;
}

// Clicking badges in turn: the clicked spot takes the next place in the order.
// A pause of a few seconds starts over from 1.
const ORDER = { next: 0, at: -1e9 };
function orderSpot(i) {
  rememberScore();
  const spots = spotsOf(editLayer());
  if (millis() - ORDER.at > 4000) ORDER.next = 0;
  const [sp] = spots.splice(i, 1);
  spots.splice(ORDER.next, 0, sp);
  EDIT.spot = ORDER.next;
  ORDER.next = (ORDER.next + 1) % spots.length;
  ORDER.at = millis();
  buildLayerDetail();
}

function pressSpot() {
  const badge = badgeAt();
  if (badge >= 0) return orderSpot(badge);
  const [x, y] = squareMouse(), hit = spotAt(x, y);
  EDIT.spot = hit ? hit.i : null;
  if (hit) {
    const [sx, sy] = spotsOf(editLayer())[hit.i];
    EDIT.drag = { mode: hit.mode, dx: sx - x, dy: sy - y };
  }
}

function dragSpot() {
  const L = editLayer(), sp = spotsOf(L)[EDIT.spot], [x, y] = squareMouse();
  if (!sp) return;
  if (!EDIT.drag.kept) { rememberScore(); EDIT.drag.kept = true; }
  if (EDIT.drag.mode === "move") {
    sp[0] = round4(clamp01(x + EDIT.drag.dx));
    sp[1] = round4(clamp01(y + EDIT.drag.dy));
  } else {
    const scale = paramsFor(elementOf(L), L).size ?? 1;
    sp[2] = round4(constrain(Math.hypot(x - sp[0], y - sp[1]) / scale, 0.01, 0.4));
  }
  keyThrough(L, sp);
}

function round4(v) { return Math.round(v * 10000) / 10000; }

// A new spot goes last in the order, the size of the selected one (or the last).
function addSpot(x, y) {
  rememberScore();
  const spots = spotsOf(editLayer()), like = spots[EDIT.spot] ?? spots[spots.length - 1];
  spots.push([round4(clamp01(x)), round4(clamp01(y)), like ? like[2] : 0.1]);
  EDIT.spot = spots.length - 1;
  buildLayerDetail();
}

// X: the drawing at this spot looks the other way.
function flipSpot(i) {
  rememberScore();
  const sp = spotsOf(editLayer())[i];
  sp[3] = sp[3] === -1 ? 1 : -1;
  tidySpot(sp);
  keyThrough(editLayer(), sp);
  buildLayerDetail();
}

// R turns the spot's drawing 15°; Shift turns it back.
function rotateSpot(i, deg) {
  rememberScore();
  const sp = spotsOf(editLayer())[i];
  sp[3] ??= 1;
  sp[4] = ((((sp[4] ?? 0) + deg) % 360) + 360) % 360;
  tidySpot(sp);
  keyThrough(editLayer(), sp);
  buildLayerDetail();
}

// ⧉ on a spot row: a copy of the spot, a step down and right, selected.
function duplicateSpot(i) {
  rememberScore();
  const spots = spotsOf(editLayer()), copy = [...spots[i]];
  copy[0] = round4(clamp01(copy[0] + 0.04));
  copy[1] = round4(clamp01(copy[1] + 0.04));
  spots.splice(i + 1, 0, copy);
  EDIT.spot = i + 1;
  buildLayerDetail();
}

// D: a duplicate shape is its own clip — same timing, spots and keys, then
// edited apart. It lands a step down and right, picked.
function duplicateClip() {
  const R = SCORE.layers[EDIT.layer], L = R?.clips?.[EDIT.clip];
  if (!L) return;
  rememberScore();
  const copy = JSON.parse(JSON.stringify(L));
  for (const sp of copy.spots ?? []) {
    sp[0] = round4(clamp01(sp[0] + 0.04));
    sp[1] = round4(clamp01(sp[1] + 0.04));
  }
  for (const k of copy.keys ?? []) {
    k.x = round4(clamp01((k.x ?? 0.5) + 0.04));
    k.y = round4(clamp01((k.y ?? 0.5) + 0.04));
  }
  R.clips.splice(EDIT.clip + 1, 0, copy);
  EDIT.clip += 1;
  flashPick();
  buildLayers();
}

// Trailing defaults fall away, so plain spots stay [x, y, size].
function tidySpot(sp) {
  if (!sp[4]) sp.length = Math.min(sp.length, 4);
  if (sp.length === 4 && sp[3] === 1) sp.length = 3;
}

function removeSpot(i) {
  rememberScore();
  spotsOf(editLayer()).splice(i, 1);
  EDIT.spot = null;
  buildLayerDetail();
}

// ---- Keyframes -----------------------------------------------------------------
// K drops a key at the playhead: the selected spot's place, kept in the clip's
// keys and eased between on playback. Scrub, drag the spot (E), K — repeat.
// On the timeline the picked clip shows its keys as diamonds; drag to move one.

function setKeyAtPlayhead() {
  const L = SCORE.layers[EDIT.layer]?.clips?.[EDIT.clip];
  if (!L?.shape) return;
  rememberScore();
  const B = round2(Math.max(0, msToBeats(SCORE, songNow())));
  const sp = (L.spots ?? elementOf(L).spots)[EDIT.spot ?? 0];
  const key = { at: atKey(B), x: sp[0], y: sp[1], size: sp[2] };
  if (sp[4]) key.deg = sp[4];
  const keys = (L.keys ??= []);
  const same = keys.find((k) => Math.abs(keyBeat(SCORE, k.at) - B) < 0.1);
  if (same) Object.assign(same, key);
  else keys.push(key);
  keys.sort((a, b) => keyBeat(SCORE, a.at) - keyBeat(SCORE, b.at));
  buildLayers();
}

// The key the playhead is standing on, if any.
function parkedKey(L) {
  if (!L?.keys?.length) return null;
  const B = round2(Math.max(0, msToBeats(SCORE, songNow())));
  return L.keys.find((k) => Math.abs(keyBeat(SCORE, k.at) - B) < 0.1) ?? null;
}

// One rule: once a clip has keys, changing it writes into the key under the
// playhead — or adds one there. So after the first K, animating is scrub,
// change, scrub, change: drags, turns, mirrors and the size slider alike.
function keyThrough(L, sp) {
  if (!L?.keys?.length) return;
  let k = parkedKey(L);
  if (!k) {
    k = { at: atKey(round2(Math.max(0, msToBeats(SCORE, songNow())))) };
    L.keys.push(k);
    L.keys.sort((a, b) => keyBeat(SCORE, a.at) - keyBeat(SCORE, b.at));
  }
  k.x = sp[0];
  k.y = sp[1];
  k.size = sp[2];
  if (sp[4]) k.deg = sp[4];
  else delete k.deg;
  if (sp[3] === -1) k.flip = -1;
  else delete k.flip;
}

// → keys: the clip's timing becomes keyframes — fade 0 at the in, 1 after the
// fade-in, mirrored at the out (a cut becomes a quarter-beat snap) — and the
// when-fields clear. From here keys rule; sculpt them freely.
function bakeKeys() {
  const L = SCORE.layers[EDIT.layer]?.clips?.[EDIT.clip];
  if (!L?.shape || L.keys?.length) return;
  rememberScore();
  const T = layerTiming(SCORE, WORLD, L);
  const sp = (L.spots ?? elementOf(L).spots)[0];
  const base = { x: sp[0], y: sp[1], size: sp[2] };
  if (sp[4]) base.deg = sp[4];
  if (sp[3] === -1) base.flip = -1;
  const keys = [];
  const put = (b, fade) => keys.push({ at: atKey(round2(Math.max(0, b))), ...base, fade });
  if (T.inLen > 0) { put(T.inAt, 0); put(T.inAt + T.inLen, 1); }
  else { put(T.s - 0.25, 0); put(T.s, 1); }
  if (T.outLen > 0) { put(T.outAt, 1); put(T.outAt + T.outLen, 0); }
  else { put(T.e - 0.25, 1); put(T.e, 0); }
  L.keys = keys.sort((a, b) => keyBeat(SCORE, a.at) - keyBeat(SCORE, b.at));
  for (const k of ["from", "to", "in", "out", "inBeats", "outBeats"]) delete L[k];
  buildLayers();
}

// A key's `at` for this beat: a moment it lands on, else "bar:beat".
function atKey(B) {
  // a hold's name means its start, so only the start anchors a key by name
  for (const m of SCORE.moments || []) for (const h of m.hold ? [m.hold[0]] : m.hits || []) if (Math.abs(h - B) < 0.1) return m.name;
  const bar = Math.floor(B / SCORE.beatsPerBar) + 1;
  return `${bar}:${round2(B - (bar - 1) * SCORE.beatsPerBar + 1)}`;
}

// A key's `at`, in words for the panel.
function atKeyWords(at) {
  if (typeof at === "string" && !/^\d+(:|$)/.test(at)) return at; // a moment's name
  return `bar ${String(at).replace(":", " · beat ")}`;
}

// The key diamond under the mouse, on the picked clip's timeline row.
let KEY_DRAG = null;
function keyAt() {
  if (!showLayerRows() || EDIT.clip == null) return null;
  const ri = EDIT.layer, ci = EDIT.clip, L = SCORE.layers[ri]?.clips?.[ci];
  if (!L?.keys?.length) return null;
  const y = TL_ROWS_Y + ri * 13;
  if (mouseY < y || mouseY > y + 12) return null;
  for (let ki = L.keys.length - 1; ki >= 0; ki--) {
    if (Math.abs(mouseX - timelineX(keyBeat(SCORE, L.keys[ki].at))) <= 4) return { ri, ci, ki };
  }
  return null;
}

// Dragging a diamond: a moment within reach attaches, else the nearest quarter beat.
function dragKey() {
  const d = KEY_DRAG, L = SCORE.layers[d.ri]?.clips?.[d.ci], k = L?.keys?.[d.ki];
  if (!k) return (KEY_DRAG = null);
  if (!d.kept) { rememberScore(); d.kept = true; }
  let at = null;
  for (const m of SCORE.moments || []) {
    for (const h of m.hold ? [m.hold[0]] : m.hits || []) if (Math.abs(timelineX(h) - mouseX) <= 8) at = m.name;
  }
  k.at = at ?? atKey(Math.max(0, Math.round(msToBeats(SCORE, mouseMs()) * 4) / 4));
}

// Edit mode works on the open layer that has spots, or the first one.
function setEdit(on, layer = EDIT.layer, clip = EDIT.clip) {
  if (on && MOMENT_MODE) setMomentMode(false);
  EDIT.on = on;
  if (layer == null || clip == null) {
    const inRow = (ri) => {
      const ci = SCORE.layers[ri]?.clips.findIndex(hasSpots);
      return ci >= 0 ? { ri, ci } : null;
    };
    let found = layer != null ? inRow(layer) : null;
    for (let ri = 0; ri < SCORE.layers.length && !found; ri++) found = inRow(ri);
    layer = found?.ri ?? null;
    clip = found?.ci ?? null;
  }
  EDIT.layer = layer;
  EDIT.clip = clip;
  if (!on) { EDIT.spot = null; EDIT.drag = null; if (canvasCursor) cursor(canvasCursor = "default"); }
  $("sq-toolbar").hidden = !editing() || !hasSpots(editLayer());
  $("edit").classList.toggle("on", on);
  LAYER_BOXES.forEach((row, li) => row.classList.toggle("editing", on && li === EDIT.layer));
}

// Outlines on the spots: dashed, solid when selected, with a square on the edge
// to resize and a number for when it opens. Actions live in the toolbar above.
function drawEditOverlay() {
  const L = editLayer(), P = paramsFor(elementOf(L), L);
  noFill(); stroke(255, 90); strokeWeight(1);
  rect(SQ_X - 0.5, SQ_Y - 0.5, SQ + 1, SQ + 1);
  textSize(10); textAlign(CENTER, CENTER);
  P.spots.forEach((spot, i) => {
    const [x, y, size] = spot, cx = SQ_X + x * SQ, cy = SQ_Y + y * SQ, r = size * P.size * SQ, sel = i === EDIT.spot;
    noFill(); stroke(255, sel ? 255 : 170); strokeWeight(sel ? 1.5 : 1);
    drawingContext.setLineDash(sel ? [] : [4, 3]);
    circle(cx, cy, 2 * r);
    drawingContext.setLineDash([]);
    stroke(255); strokeWeight(1); fill(sel ? 255 : 0);
    rect(cx + r - 3, cy - 3, 6, 6);
    const [bx, by] = badgeOf(spot, P.size);
    noStroke(); fill(sel ? 255 : 0);
    rect(bx - 8, by - 8, 16, 16);
    fill(sel ? 0 : 255);
    text(i + 1, bx, by + 1);
    if (spot[3] === -1 || spot[4]) {
      textAlign(LEFT, CENTER); fill(255);
      text(`${spot[4] ? `${spot[4]}°` : ""}${spot[3] === -1 ? " ⇄" : ""}`.trim(), bx + 11, by + 1);
      textAlign(CENTER, CENTER);
    }
  });
  // the toolbar above the square: what a press would act on, and a short hint
  const ordering = millis() - ORDER.at <= 4000;
  const B = round2(Math.max(0, msToBeats(SCORE, songNow())));
  const onKey = L.keys?.findIndex((k) => Math.abs(keyBeat(SCORE, k.at) - B) < 0.1) ?? -1;
  const label = clipLabel(SCORE.layers[EDIT.layer], EDIT.clip);
  setText("sq-edit-hint", ordering
    ? `click the spot that opens ${ORDER.next + 1}`
    : onKey >= 0 ? `on key ${onKey + 1} — dragging the ${label} writes into it`
    : L.keys?.length ? `dragging the ${label} adds a key at the playhead`
    : `drag: move · edge: resize · double-click: add ${label}`);
  for (const id of ["sq-flip", "sq-turn", "sq-del"]) $(id).disabled = EDIT.spot == null;
  $("sq-dup").disabled = false;
  $("sq-order").disabled = P.spots.length < 2;
  $("sq-key").disabled = !L.shape;
  // the cursor says what a press would do
  const [mx, my] = squareMouse(), hit = mx >= 0 && mx <= 1 && my >= 0 && my <= 1 ? spotAt(mx, my) : null;
  const want = EDIT.drag ? (EDIT.drag.mode === "move" ? "grabbing" : "nwse-resize")
    : badgeAt() >= 0 ? "pointer" : hit ? (hit.mode === "move" ? "grab" : "nwse-resize") : "crosshair";
  if (canvasCursor !== want) cursor(canvasCursor = want);
}
let canvasCursor = null;

// ---- Keeping work ----------------------------------------------------------------
// The working score lives in this browser, so edits survive a reload. It's
// saved every couple of seconds and when the page closes. "Copy score.js"
// stays the way to bake it into the file; "Reset to score.js" drops it.

const WORK = "soundsquare.work";
let WORK_SAVED = "";

function keepWork() {
  const now = JSON.stringify(SCORE);
  if (now === WORK_SAVED) return;
  WORK_SAVED = now;
  try { localStorage.setItem(WORK, now); } catch {}
}

function restoreWork() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORK));
    if (!saved?.layers) return;
    for (const k of Object.keys(SCORE)) delete SCORE[k];
    Object.assign(SCORE, saved);
    WORK_SAVED = JSON.stringify(SCORE);
  } catch {}
}

function forgetWork() {
  if (!confirm("Drop the edits kept in this browser and reload from score.js?")) return;
  try { localStorage.removeItem(WORK); } catch {}
  window.removeEventListener("pagehide", keepWork);
  WORK_SAVED = JSON.stringify(SCORE); // keep the interval from saving it back
  location.reload();
}

// ---- Undo --------------------------------------------------------------------
// ⌘Z / ⇧⌘Z on the square: snapshots of the score around every edit — spots,
// clips, layers, moments, pulses, menus and sliders. (The Shapes tab has its own.)

const UNDO = { past: [], future: [] };
let SLIDING = false; // one undo step per slider drag

function rememberScore() {
  UNDO.past.push(JSON.stringify(SCORE));
  if (UNDO.past.length > 200) UNDO.past.shift();
  UNDO.future = [];
}

function undoScore() {
  if (!UNDO.past.length) return;
  UNDO.future.push(JSON.stringify(SCORE));
  restoreScore(UNDO.past.pop());
}

function redoScore() {
  if (!UNDO.future.length) return;
  UNDO.past.push(JSON.stringify(SCORE));
  restoreScore(UNDO.future.pop());
}

function restoreScore(json) {
  const saved = JSON.parse(json);
  for (const k of Object.keys(SCORE)) delete SCORE[k];
  Object.assign(SCORE, saved);
  WORLD = prepare(SCORE);
  EDIT.spot = null;
  EDIT.drag = null;
  renderMoments();
  buildLayers();
  renderPulses();
  buildPalettes();
  loadShapes();
}

// ---- Moments -------------------------------------------------------------------
// M marks what you hear. A tap is a hit; quick taps build one moment (the two
// fast taps); a pause starts the next. M held down marks a hold: a span from
// press to release ("the bongo section"). The Moments panel renames and removes
// them; markers and bands on the timeline drag.

const MARKING = { at: -1e9, moment: null };
let MOMENT_DRAG = null;
let HIDE_MOMENTS = false; // the global toggle: no markers on the timeline at all
let MOMENT_MODE = false;  // M: the square marks moments instead of picking shapes

function setMomentMode(on) {
  MOMENT_MODE = on;
  if (on && EDIT.on) setEdit(false);
  $("moments-rail").classList.toggle("marking", on);
  $("tap-status").classList.toggle("marking", on);
  setText("tap-status", on ? "moment mode — tap, hold or drag on the square · M leaves" : "");
}

function markHold(fromMs, toMs, path) {
  rememberScore();
  SCORE.moments ??= [];
  const hold = [round2(msToBeats(SCORE, fromMs)), round2(msToBeats(SCORE, toMs))].sort((a, b) => a - b);
  let n = SCORE.moments.length + 1;
  while (SCORE.moments.some((x) => x.name === `moment ${n}`)) n++;
  const m = { name: `moment ${n}`, hold };
  if (path?.length > 2) m.path = [path]; // the motion drawn on the square: strokes of [x, y, beat]
  SCORE.moments.push(m);
  momentsChanged();
  setText("tap-status", `moment ${n} · ${round2(hold[1] - hold[0])} beats long · rename it in Moments`);
}

// Marking on the square itself (moment mode): a press marks what you hear — a
// tap is a hit, held longer a hold, and dragging records the motion's path
// into the moment (the hold spans the drag).
let SQ_MARK = null;

function pressMark() {
  SQ_MARK = { atMs: songNow(), t: performance.now(), path: [] };
  const [x, y] = squareMouse();
  MARK_FX = { x: clamp01(x), y: clamp01(y), t0: millis(), released: null, r: 0.02 };
}

// Song time under the marking pointer: the song itself while it plays; paused,
// the gesture takes the time it's drawn in, starting at the playhead.
function markMs() {
  return source.playing ? songNow() : SQ_MARK.atMs + (performance.now() - SQ_MARK.t);
}

function dragMark() {
  const [x, y] = squareMouse(), p = SQ_MARK.path, last = p[p.length - 1];
  MARK_FX.x = clamp01(x);
  MARK_FX.y = clamp01(y);
  if (last && Math.hypot(x - last[0], y - last[1]) < 0.005) return;
  p.push([round4(clamp01(x)), round4(clamp01(y)), round2(msToBeats(SCORE, markMs()))]);
}

function releaseMark() {
  const endMs = markMs();
  const { atMs, t, path, into } = SQ_MARK;
  SQ_MARK = null;
  if (MARK_FX) MARK_FX.released = millis();
  if (into != null) return drawInto(into, atMs, endMs, path);
  const span = Math.abs(msToBeats(SCORE, endMs) - msToBeats(SCORE, atMs));
  // a quick tap, or a hold with no song time under it (paused), is a hit
  if ((performance.now() - t < 350 && path.length <= 2) || span < 0.1) return markHit(atMs);
  markHold(atMs, endMs, tidyPath(path));
}

// + Draw on a moment's card: the next gestures on the square become strokes of
// that moment's drawing. Its hold stretches to cover them, and the shapes
// following the drawing re-follow it.
function drawInto(mi, fromMs, toMs, path) {
  const m = SCORE.moments?.[mi];
  if (!m || path.length < 3) return;
  rememberScore();
  strokesOf(m);
  const stroke = tidyPath(path);
  if (m.path) m.path.push(stroke);
  else m.path = [stroke];
  const s = round2(msToBeats(SCORE, Math.min(fromMs, toMs))), e = round2(msToBeats(SCORE, Math.max(fromMs, toMs)));
  if (m.hold) m.hold = [round2(Math.min(m.hold[0], s)), round2(Math.max(m.hold[1], e))];
  for (const R of SCORE.layers) {
    for (const L of R.clips) if (L.keysFrom === m.name) L.keys = pathKeys(m, L.keys?.[0]?.size ?? 0.12);
  }
  momentsChanged();
}

// The recorded gesture, smoothed: two rounds of corner-cutting (Chaikin) over
// [x, y, beat] alike, then thinned to at most 64 points.
function tidyPath(pts) {
  let p = pts;
  for (let r = 0; r < 2 && p.length > 2; r++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push(a.map((v, k) => round4(v * 0.75 + b[k] * 0.25)), a.map((v, k) => round4(v * 0.25 + b[k] * 0.75)));
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  if (p.length > 64) {
    const step = (p.length - 1) / 63;
    p = Array.from({ length: 64 }, (_, i) => p[Math.round(i * step)]);
  }
  return p;
}

// A moment's drawing is strokes: [[ [x, y, beat], ... ], ...]. Older scores
// kept one bare stroke; normalized on read.
function strokesOf(m) {
  if (!m.path?.length) return null;
  if (!Array.isArray(m.path[0][0])) m.path = [m.path];
  return m.path;
}

// A stroke as a pen line (perfect-freehand): it thins and swells like ink.
// Points in pixels; blend inverts what's underneath so it reads on any color.
function penStroke(ctx, pts, size, alpha = 1, blend = true) {
  if (pts.length < 2) return;
  ctx.save();
  if (blend) ctx.globalCompositeOperation = "difference";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  if (window.getStroke) {
    const out = getStroke(pts, { size, thinning: 0.55, smoothing: 0.65, streamline: 0.45, simulatePressure: true });
    const p = new Path2D();
    out.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    ctx.fill(p);
  } else {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, size / 2);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();
}

function penSize() { return Math.max(3, SQ / 110); }

// The stroke so far, while the mouse draws it.
function drawMarkPath() {
  if (!SQ_MARK || SQ_MARK.path.length < 2) return;
  penStroke(drawingContext, SQ_MARK.path.map(([x, y]) => [SQ_X + x * SQ, SQ_Y + y * SQ]), penSize());
}

// The marking pulse, ripple style: a center dot under the press, rings
// emanating from it — each eases outward and fades — one after another while
// held; the ones in flight finish after release.
let MARK_FX = null;
const RIPPLE = { period: 420, life: 850, r: 0.07 };

function drawMarkFx() {
  if (!MARK_FX) return;
  const f = MARK_FX, now = millis();
  const lastSpawn = f.released ?? now;
  push();
  translate(SQ_X, SQ_Y);
  scale(SQ);
  drawingContext.save();
  drawingContext.globalCompositeOperation = "difference";
  let alive = f.released == null;
  for (let s = f.t0; s <= lastSpawn; s += RIPPLE.period) {
    const t = (now - s) / RIPPLE.life;
    if (t < 0 || t >= 1) continue;
    alive = true;
    const out = 1 - (1 - t) * (1 - t); // fast out of the dot, slowing as it fades
    noFill(); stroke(255, 190 * (1 - t) * (1 - t)); strokeWeight(px(1.5));
    circle(f.x, f.y, 2 * (0.008 + out * RIPPLE.r));
  }
  if (f.released == null) { noStroke(); fill(255, 230); circle(f.x, f.y, 0.014); }
  drawingContext.restore();
  pop();
  if (!alive) MARK_FX = null;
}

function markHit(at) {
  const beat = round2(msToBeats(SCORE, at));
  rememberScore();
  SCORE.moments ??= [];
  let m = MARKING.moment;
  if (!m || performance.now() - MARKING.at > 2000 || !SCORE.moments.includes(m)) {
    let n = SCORE.moments.length + 1;
    while (SCORE.moments.some((x) => x.name === `moment ${n}`)) n++;
    m = { name: `moment ${n}`, hits: [] };
    SCORE.moments.push(m);
    MARKING.moment = m;
  }
  MARKING.at = performance.now();
  m.hits.push(beat);
  momentsChanged();
  setText("tap-status", `${m.name} · ${m.hits.length} hit${m.hits.length > 1 ? "s" : ""} · rename it in Moments`);
}

// Anything that reads moments is told: the prepared world, the panel, the menus.
function momentsChanged() {
  for (const m of SCORE.moments || []) (m.hold ?? m.hits)?.sort((a, b) => a - b);
  WORLD = prepare(SCORE);
  renderMoments();
  buildLayers();
  renderPulses();
}

// The moments rail: a colored chip per moment on the square's left, in song
// order. Hover slides a chip out to its name; a click opens its card — name,
// when, a note about what you heard, the eye, remove. The same color marks it
// on the timeline. The eye at the rail's foot hides every marker at once.
const MO_COLORS = ["#e76f51", "#f4a261", "#e9c46a", "#2a9d8f", "#4fb3d9", "#b388eb", "#ef6292", "#8bc34a"];
let MO_OPEN = null;  // the open moment (its index in SCORE.moments)
let MO_HOVER = null; // the chip under the pointer — Delete removes it

function deleteMoment(mi) {
  rememberScore();
  SCORE.moments.splice(mi, 1);
  MO_OPEN = null;
  MO_HOVER = null;
  momentsChanged();
}

function momentColor(mi) { return MO_COLORS[mi % MO_COLORS.length]; }

function renderMoments() {
  const rail = $("moments-rail"), list = SCORE.moments || [];
  MO_HOVER = null;
  if (MO_OPEN != null && MO_OPEN >= list.length) MO_OPEN = null;
  if (DRAW_INTO != null && (DRAW_INTO >= list.length || DRAW_INTO !== MO_OPEN)) DRAW_INTO = null;
  const order = list.map((m, mi) => ({ m, mi }))
    .sort((a, b) => (momentStart(SCORE, a.m.name) ?? 0) - (momentStart(SCORE, b.m.name) ?? 0));
  const title = document.createElement("span");
  title.className = "label mo-title";
  title.textContent = "Moments";
  title.title = "M while the song plays marks one: tap for a hit, hold for a span";
  rail.replaceChildren(title, ...order.map(({ m, mi }) => moChip(m, mi)));
  if (list.length) {
    const all = document.createElement("button");
    all.className = "mo-all";
    all.title = HIDE_MOMENTS ? "Show all markers on the timeline" : "Hide all markers on the timeline";
    all.innerHTML = HIDE_MOMENTS ? EYE_OFF : EYE;
    all.addEventListener("click", (e) => {
      e.currentTarget.blur();
      HIDE_MOMENTS = !HIDE_MOMENTS;
      renderMoments();
    });
    rail.append(all);
  }
}

function momentMeta(m) {
  return m.hold
    ? `${round2(m.hold[1] - m.hold[0])} beats · ${atWords(m.hold[0])}`
    : `${m.hits.length} hit${m.hits.length === 1 ? "" : "s"} · ${atWords(m.hits[0] ?? 0)}`;
}

function moChip(m, mi) {
  const chip = document.createElement("div");
  chip.className = "mo-chip" + (MO_OPEN === mi ? " open" : "") + (m.hide ? " off" : "");
  chip.style.setProperty("--mc", momentColor(mi));
  chip.addEventListener("mouseenter", () => { MO_HOVER = mi; });
  chip.addEventListener("mouseleave", () => { if (MO_HOVER === mi) MO_HOVER = null; });
  const b = document.createElement("button");
  b.className = "mo-tab";
  b.textContent = m.name;
  b.title = momentMeta(m);
  b.addEventListener("click", (e) => {
    e.currentTarget.blur();
    MO_OPEN = MO_OPEN === mi ? null : mi;
    DRAW_INTO = null;
    PATH_PLAY = null;
    renderMoments();
  });
  chip.append(b);
  if (MO_OPEN === mi) chip.append(moCard(m, mi));
  return chip;
}

function moCard(m, mi) {
  const card = document.createElement("div");
  card.className = "moment-card mo-card";
  const penBtn = `<button class="mini pen${DRAW_INTO === mi ? " on" : ""}" title="Draw on the square: each gesture becomes a stroke of this moment's drawing">✎</button>`;
  card.innerHTML =
    `<div class="moment-row"><input class="input name" type="text" spellcheck="false" autocomplete="off">` +
    (m.path ? "" : penBtn) +
    `<button class="mini eye" title="${m.hide ? "Show its marker on the timeline" : "Hide its marker (it still anchors and triggers)"}">${m.hide ? EYE_OFF : EYE}</button>` +
    `<button class="mini" data-del title="Remove the moment (what used it falls back to bars)">×</button></div>` +
    `<span class="data dimmed">${momentMeta(m)}</span>` +
    `<input class="input note" type="text" spellcheck="false" autocomplete="off" placeholder="a note about what you heard">`;
  const name = card.querySelector(".name");
  name.value = m.name;
  name.addEventListener("change", () => renameMoment(m, name.value));
  const note = card.querySelector(".note");
  note.value = m.note ?? "";
  note.addEventListener("change", () => {
    rememberScore();
    if (note.value.trim()) m.note = note.value.trim();
    else delete m.note;
  });
  card.querySelector(".eye").addEventListener("click", (e) => {
    e.currentTarget.blur();
    rememberScore();
    if (m.hide) delete m.hide;
    else m.hide = true;
    renderMoments();
  });
  card.querySelector("[data-del]").addEventListener("click", () => deleteMoment(mi));
  if (m.path) {
    // the ▶ and ✎ live inside the animation, top right
    const anim = document.createElement("div");
    anim.className = "mo-anim";
    anim.append(pathPreview(m));
    anim.insertAdjacentHTML("beforeend",
      `<div class="fx"><button class="mini play" title="Run the drawing once on the square">▶</button>${penBtn}</div>`);
    anim.querySelector(".play").addEventListener("click", (e) => {
      e.currentTarget.blur();
      PATH_PLAY = { mi, t0: millis() };
    });
    card.append(anim);
  }
  card.querySelector(".pen").addEventListener("click", (e) => {
    e.currentTarget.blur();
    DRAW_INTO = DRAW_INTO === mi ? null : mi;
    if (DRAW_INTO != null && MOMENT_MODE) setMomentMode(false);
    renderMoments();
  });
  card.append(moShapes(m));
  return card;
}

// The moment's shapes: a small image per attached shape (click opens it), and
// a picker that attaches another — anchored to the moment, and following its
// drawn path as keyframes when it has one.
function moShapes(m) {
  const wrap = document.createElement("div");
  wrap.className = "mo-shapes";
  SCORE.layers.forEach((R, ri) => R.clips.forEach((L, ci) => {
    if (!L.shape || (L.from !== m.name && L.to !== m.name)) return;
    const b = document.createElement("button");
    b.className = "mo-shape";
    b.title = "Open its settings";
    b.innerHTML = `<img src="shapes/${encodeURIComponent(L.shape)}.svg" alt=""><span>${clipLabel(R, ci)}</span>`;
    b.addEventListener("click", (e) => {
      e.currentTarget.blur();
      selectLayer(ri, ci, true);
    });
    wrap.append(b);
  }));
  const sel = document.createElement("select");
  sel.className = "input";
  sel.title = "Attach a shape: it runs on this moment, along its drawn path if there is one";
  sel.innerHTML = `<option value="">+ shape…</option>` + ED.library.map((n) => `<option>${n}</option>`).join("");
  sel.addEventListener("change", () => {
    const name = sel.value;
    sel.value = "";
    sel.blur();
    if (name) attachShape(m, name);
  });
  wrap.append(sel);
  return wrap;
}

function attachShape(m, name) {
  rememberScore();
  loadShape(name);
  const start = momentStart(SCORE, m.name) ?? 0;
  const bar = Math.floor(start / SCORE.beatsPerBar) + 1;
  const clip = { shape: name, from: m.name, in: "fade", out: "fade", spots: [[0.5, 0.5, 0.15]] };
  clip.to = m.hold ? m.name : Math.min(SCORE.bars, bar + 7); // a hold wraps it ("during")
  if (m.path) {
    clip.keys = pathKeys(m);
    clip.keysFrom = m.name; // editing the drawn path re-follows it
    const k = clip.keys[0];
    clip.spots = [[k.x, k.y, k.size]];
  }
  let ri = SCORE.layers.findIndex((R) => R.name === m.name);
  if (ri < 0) {
    SCORE.layers.push({ name: m.name, clips: [] });
    ri = SCORE.layers.length - 1;
  }
  SCORE.layers[ri].clips.push(clip);
  EDIT.layer = ri;
  EDIT.clip = SCORE.layers[ri].clips.length - 1;
  flashPick();
  buildLayers();
  renderMoments();
}

// ---- The open moment's drawing, on the square ----------------------------------
// With a moment's card open, its drawn motion shows in place: the path, and a
// dot replaying it on loop. Dragging the line reshapes it — nearby points
// follow, less the farther away they sit — and shapes attached to the path
// re-follow the new line on release.
let PATH_DRAG = null;
let PATH_PLAY = null; // { mi, t0 }: the ▶ button runs the drawing once
let DRAW_INTO = null; // the moment taking new strokes from the square

// A drawing's points in time order, across its strokes.
function pathFlat(m) {
  return strokesOf(m).flat().slice().sort((a, b) => a[2] - b[2]);
}

function drawMomentPath() {
  const m = SCORE.moments?.[MO_OPEN];
  const strokes = m && strokesOf(m);
  if (!strokes || document.body.classList.contains("bare")) return;
  for (const s of strokes) {
    penStroke(drawingContext, s.map(([x, y]) => [SQ_X + x * SQ, SQ_Y + y * SQ]), penSize(), PATH_DRAG ? 1 : 0.75);
  }
  if (!PATH_PLAY || PATH_PLAY.mi !== MO_OPEN) return;
  // ▶ runs a dot along the drawing once, at the recorded timing
  const pts = pathFlat(m);
  const b0 = pts[0][2], b1 = pts[pts.length - 1][2];
  const spanMs = Math.max(400, beatsToMs(SCORE, b1) - beatsToMs(SCORE, b0));
  const t = (millis() - PATH_PLAY.t0) / spanMs;
  if (t >= 1) { PATH_PLAY = null; return; }
  const beat = b0 + (b1 - b0) * t;
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1][2] <= beat) i++;
  const a = pts[i], b = pts[i + 1] ?? a;
  const k = b[2] > a[2] ? clamp01((beat - a[2]) / (b[2] - a[2])) : 1;
  const ctx = drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(SQ_X + (a[0] + (b[0] - a[0]) * k) * SQ, SQ_Y + (a[1] + (b[1] - a[1]) * k) * SQ, Math.max(4, SQ / 80), 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

// The open drawing under (x, y): the nearest point of any stroke within reach.
function pathPointAt(x, y) {
  const m = SCORE.moments?.[MO_OPEN];
  const strokes = m && strokesOf(m);
  if (!strokes) return null;
  const tol = 10 / SQ;
  let best = null;
  strokes.forEach((s, si) => s.forEach((p, i) => {
    const d = Math.hypot(x - p[0], y - p[1]);
    if (d <= tol && (!best || d < best.d)) best = { si, i, d };
  }));
  return best ? { m, si: best.si, i: best.i } : null;
}

function dragPath() {
  const { m, si, i } = PATH_DRAG, [x, y] = squareMouse();
  if (!PATH_DRAG.kept) { rememberScore(); PATH_DRAG.kept = true; }
  const dx = x - PATH_DRAG.x, dy = y - PATH_DRAG.y;
  PATH_DRAG.x = x;
  PATH_DRAG.y = y;
  m.path[si].forEach((p, j) => {
    const w = Math.exp(-((j - i) * (j - i)) / 50); // the pull falls off along the stroke
    if (w < 0.01) return;
    p[0] = round4(clamp01(p[0] + dx * w));
    p[1] = round4(clamp01(p[1] + dy * w));
  });
}

function releasePath() {
  const { m, kept } = PATH_DRAG;
  PATH_DRAG = null;
  if (!kept) return;
  for (const R of SCORE.layers) {
    for (const L of R.clips) {
      if (L.keysFrom === m.name) L.keys = pathKeys(m, L.keys?.[0]?.size ?? 0.12);
    }
  }
  buildLayers();
  renderMoments();
}

// A drawn path as keyframes: up to 16 keys along it, at the recorded beats.
// They play back linearly (ease: "line"), so the motion flows instead of
// pausing into every key.
function pathKeys(m, size = 0.12) {
  const pts = pathFlat(m), n = Math.min(16, pts.length);
  const keys = [];
  for (let i = 0; i < n; i++) {
    const p = pts[Math.round((i * (pts.length - 1)) / (n - 1))];
    keys.push({ at: atKey(p[2]), x: p[0], y: p[1], size, ease: "line" });
  }
  return keys.filter((k, i) => i === 0 || keyBeat(SCORE, k.at) > keyBeat(SCORE, keys[i - 1].at) + 1e-6);
}

// A little looping playback of the motion drawn on the square: the path, with
// a dot tracing it at the recorded timing.
function pathPreview(m) {
  const c = document.createElement("canvas");
  c.className = "mo-path";
  c.width = c.height = 228;
  const ctx = c.getContext("2d");
  const strokes = strokesOf(m), pts = pathFlat(m);
  const b0 = pts[0][2], b1 = pts[pts.length - 1][2];
  const spanMs = Math.max(400, beatsToMs(SCORE, b1) - beatsToMs(SCORE, b0));
  const at = (beat) => { // the point on the drawing at this beat, interpolated
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1][2] <= beat) i++;
    const a = pts[i], b = pts[i + 1] ?? a;
    const t = b[2] > a[2] ? Math.min(1, Math.max(0, (beat - a[2]) / (b[2] - a[2]))) : 1;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const frame = (now) => {
    if (!c.isConnected) return; // the card closed; stop
    ctx.clearRect(0, 0, 228, 228);
    for (const s of strokes) penStroke(ctx, s.map((q) => [q[0] * 228, q[1] * 228]), 3.5, 0.9, false);
    const t = Math.min(1, (now % (spanMs + 600)) / spanMs);
    const [dx, dy] = at(b0 + (b1 - b0) * t);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(dx * 228, dy * 228, 4, 0, 2 * Math.PI);
    ctx.fill();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return c;
}

function atWords(beat) {
  const bar = Math.floor(beat / SCORE.beatsPerBar) + 1;
  const inBar = Math.round((beat - (bar - 1) * SCORE.beatsPerBar) * 100) / 100;
  return `bar ${bar} · beat ${inBar + 1}`;
}

// A new name follows through to everything that points at the old one.
function renameMoment(m, name) {
  name = name.trim();
  const taken = (SCORE.moments || []).some((x) => x !== m && x.name === name);
  if (!name || name === m.name || taken) return renderMoments();
  rememberScore();
  const old = m.name;
  m.name = name;
  for (const R of SCORE.layers) {
    for (const L of R.clips) for (const k of ["from", "to", "moveOn", "keysFrom"]) if (L[k] === old) L[k] = name;
  }
  for (const cm of SCORE.colorMoves || []) {
    for (const k of ["from", "until"]) if (cm[k] === old) cm[k] = name;
  }
  momentsChanged();
}

// The marker under the mouse, on the timeline's moments row.
function momentMarkerAt() {
  if (HIDE_MOMENTS) return null;
  const y = height - timelineHeight() + 34;
  if (mouseY < y || mouseY > y + 13) return null;
  const list = SCORE.moments || [];
  for (let mi = list.length - 1; mi >= 0; mi--) {
    const m = list[mi];
    if (m.hide) continue;
    if (m.hold) {
      const a = timelineX(m.hold[0]), b = timelineX(m.hold[1]);
      if (Math.abs(mouseX - a) <= 5) return { mi, hold: 0 };
      if (Math.abs(mouseX - b) <= 5) return { mi, hold: 1 };
      if (mouseX > a && mouseX < b) return { mi, hold: "body", grab: msToBeats(SCORE, mouseMs()) - m.hold[0] };
      continue;
    }
    for (let hi = (m.hits || []).length - 1; hi >= 0; hi--) {
      if (Math.abs(mouseX - timelineX(m.hits[hi])) <= 5) return { mi, hi };
    }
  }
  return null;
}

function dragMoment() {
  const m = (SCORE.moments || [])[MOMENT_DRAG.mi];
  if (!m) return (MOMENT_DRAG = null);
  if (!MOMENT_DRAG.kept) { rememberScore(); MOMENT_DRAG.kept = true; }
  const beat = round2(msToBeats(SCORE, mouseMs()));
  if (MOMENT_DRAG.hold === "body") {
    const len = m.hold[1] - m.hold[0];
    m.hold[0] = round2(beat - MOMENT_DRAG.grab);
    m.hold[1] = round2(m.hold[0] + len);
  } else if (MOMENT_DRAG.hold != null) m.hold[MOMENT_DRAG.hold] = beat;
  else m.hits[MOMENT_DRAG.hi] = beat;
  WORLD = prepare(SCORE); // the full refresh (and the hold's ends sorting) comes on release
}

// ---- Side panel --------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const shown = {}; // last text written to each readout, so unchanged ones are skipped

function setText(id, text) {
  if (shown[id] !== text) { $(id).textContent = text; shown[id] = text; }
}

function buildPanel() {
  renderMoments();
  buildLayers();
  renderPulses();
  buildPalettes();
}

// The palette swatches, rebuilt when undo replaces the score.
function buildPalettes() {
  $("colors").replaceChildren();
  for (const [name, pal] of Object.entries(SCORE.palettes)) {
    const group = document.createElement("div"), swatches = document.createElement("div");
    group.className = "palette";
    group.innerHTML = `<div class="data">${name}</div>`;
    swatches.className = "swatches";
    for (const [slot, value] of Object.entries(pal)) {
      const list = Array.isArray(value) ? value : [value];
      list.forEach((hex, i) => {
        const input = document.createElement("input");
        input.type = "color";
        input.value = hex;
        input.title = Array.isArray(value) ? `${slot} ${i + 1}` : slot;
        input.addEventListener("input", () => {
          if (Array.isArray(value)) value[i] = input.value; else pal[slot] = input.value;
        });
        swatches.append(input);
      });
    }
    group.append(swatches);
    $("colors").append(group);
  }
}

// Picking marks a layer (ci empty) or one of its shapes; the Shape pane follows
// quietly. Only clicking the shape on the square itself, its clip on the
// timeline, or pressing Edit jumps the panel to the pane (reveal).
function selectLayer(ri, ci, reveal = false) {
  EDIT.spot = null;
  EDIT.layer = ri;
  EDIT.clip = ci ?? null;
  if (ci != null) FOLDED.delete(SCORE.layers[ri]?.name); // the pane nests under its row
  if (ci != null) PANE_FOLD = false; // picking a shape opens its pane
  if (ci != null) flashPick();
  buildLayers();
  if (reveal) revealLayerPanel();
}

function revealLayerPanel() {
  if (PANE_FOLD) { PANE_FOLD = false; buildLayers(); }
  $("layers-fold").open = true;
  $("layer-detail").scrollIntoView({ block: "nearest" });
}

// The shape under (x, y) on the square, topmost first, found by its spots.
function shapeOnSquare(x, y) {
  for (let ri = SCORE.layers.length - 1; ri >= 0; ri--) {
    const R = SCORE.layers[ri];
    if (R.hidden) continue;
    for (let ci = R.clips.length - 1; ci >= 0; ci--) {
      const L = R.clips[ci];
      if (!ACTIVE[ri]?.has(ci) || !hasSpots(L)) continue;
      const P = paramsFor(elementOf(L), L);
      for (const [sx, sy, size] of P.spots) {
        if (Math.hypot(x - sx, y - sy) <= size * (P.size ?? 1)) return { ri, ci };
      }
    }
  }
  return null;
}

function hasSpots(L) { return !!L && !!(L.spots || elementOf(L)?.spots); }

// A clip's display name: duplicates in the same layer get numbers (eye 1, eye 2).
function clipLabel(R, ci) {
  const name = layerName(R.clips[ci]);
  const like = R.clips.flatMap((c, i) => (layerName(c) === name ? [i] : []));
  return like.length > 1 ? `${name} ${like.indexOf(ci) + 1}` : name;
}

// Picking a shape flashes it on the square, so the pick is unmistakable.
const FLASH = { ri: null, ci: null, until: 0, len: 900 };

function flashPick() {
  FLASH.ri = EDIT.layer;
  FLASH.ci = EDIT.clip;
  FLASH.until = millis() + FLASH.len;
}

// Blinking inverted rings where the picked shape sits (its keyed place, or its
// spots), drawn inside the square's translated context.
function drawFlash(B) {
  if (FLASH.until < millis() || FLASH.ci == null) return;
  const L = SCORE.layers[FLASH.ri]?.clips?.[FLASH.ci], el = L && elementOf(L);
  if (!el) return;
  const P = paramsFor(el, L);
  const places = L.keys?.length
    ? [keyedPlace(SCORE, L.keys, B)]
    : (P.spots ?? []).map(([x, y, size]) => ({ x, y, size }));
  if (!places.length) return;
  const t = (FLASH.until - millis()) / FLASH.len;
  const a = 255 * Math.min(1, 2 * t) * (0.4 + 0.6 * Math.abs(Math.sin((1 - t) * 3 * Math.PI)));
  drawingContext.save();
  drawingContext.globalCompositeOperation = "difference";
  noFill(); stroke(255, a); strokeWeight(px(3));
  for (const p of places) circle(p.x, p.y, Math.max(0.04, 2 * p.size * P.size) + px(8));
  drawingContext.restore();
}

// The list, like an animation editor's: a row per layer, its shape clips
// nested under it. Click a clip (here or on the timeline) to pick it; only the
// picked clip's controls show. Double-click a layer's name to rename it, drag
// it to restack (lower layers draw on top), the eye hides the whole layer, the
// caret folds its shapes away (a fold is looks only, kept out of the score).
let LAY_RENAME = null, ROW_DRAG = null;
const FOLDED = new Set(); // layer names whose shape rows are folded away
let PANE_FOLD = false;    // the picked shape's settings, folded under its row

function buildLayers() {
  if (!SCORE.layers.length) { EDIT.layer = EDIT.clip = null; }
  else {
    EDIT.layer = Math.min(EDIT.layer ?? 0, SCORE.layers.length - 1);
    const R = SCORE.layers[EDIT.layer];
    if (EDIT.clip != null) EDIT.clip = R.clips.length ? Math.min(EDIT.clip, R.clips.length - 1) : null;
  }
  $("detail-home").append($("layer-detail")); // parked while the rows rebuild
  $("layers").replaceChildren();
  LAYER_BOXES = [];
  SCORE.layers.forEach((R, ri) => {
    const row = document.createElement("div");
    row.className = "lay-row" + (ri === EDIT.layer ? " on" : "") + (R.hidden ? " off" : "");
    row.dataset.ri = ri;
    row.draggable = LAY_RENAME !== ri;
    const name = LAY_RENAME === ri
      ? `<input class="input" type="text" value="${R.name}" spellcheck="false" autocomplete="off">`
      : `<span class="name">${R.name}</span>`;
    const meta = R.clips.length || "empty";
    const folded = FOLDED.has(R.name);
    const caret = R.clips.length
      ? `<button class="mini fold-btn" data-act="fold" title="${folded ? "Show its shapes" : "Fold its shapes away"}">${folded ? "▸" : "▾"}</button>`
      : `<span class="fold-btn"></span>`;
    row.innerHTML = `${caret}<span class="grip" title="Drag to restack (lower layers draw on top)">⋮⋮</span>${name}` +
      `<span class="dimmed">${meta}</span>` +
      `<button class="mini eye" data-act="eye" title="${R.hidden ? "Show the layer" : "Hide the layer on the square"}">${R.hidden ? EYE_OFF : EYE}</button>` +
      `<button class="mini" data-act="del" title="Remove the layer and its shapes">×</button>`;
    row.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      e.target.closest("button")?.blur();
      if (act === "fold") {
        if (FOLDED.has(R.name)) FOLDED.delete(R.name);
        else FOLDED.add(R.name);
        buildLayers();
      } else if (act === "eye") {
        rememberScore();
        if (R.hidden) delete R.hidden;
        else R.hidden = true;
        buildLayers();
      } else if (act === "del") {
        rememberScore();
        SCORE.layers.splice(ri, 1);
        EDIT.clip = null;
        buildLayers();
      } else if (!e.target.matches("input")) selectLayer(ri);
    });
    row.addEventListener("dblclick", (e) => {
      if (e.target.closest("button") || e.target.matches("input")) return;
      LAY_RENAME = ri;
      buildLayers();
    });
    $("layers").append(row);
    LAYER_BOXES.push(row);
    if (!folded) R.clips.forEach((L, ci) => {
      const picked = ri === EDIT.layer && ci === EDIT.clip;
      const c = document.createElement("button");
      c.className = "clip-row" + (picked ? " on" : "");
      c.innerHTML = `<span class="fold-btn" title="Fold the settings away">${picked ? (PANE_FOLD ? "▸" : "▾") : ""}</span>` +
        `<span class="name">${clipLabel(R, ci)}</span><span>${timeWords(L)}</span>`;
      c.addEventListener("click", (e) => {
        if (picked && e.target.classList.contains("fold-btn")) {
          PANE_FOLD = !PANE_FOLD;
          buildLayers();
        } else selectLayer(ri, ci);
      });
      $("layers").append(c);
      // the picked shape's settings sit right under its row, unless folded
      if (picked && !PANE_FOLD) $("layers").append($("layer-detail"));
    });
  });
  const input = $("layers").querySelector(".lay-row input");
  if (input) {
    input.focus();
    input.select();
    const done = (keep) => {
      if (LAY_RENAME == null) return;
      const R = SCORE.layers[LAY_RENAME], name = input.value.trim();
      LAY_RENAME = null;
      if (keep && R && name && name !== R.name) {
        rememberScore();
        if (FOLDED.delete(R.name)) FOLDED.add(name); // the fold follows the rename
        R.name = name;
      }
      buildLayers();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") done(false);
      e.stopPropagation();
    });
    input.addEventListener("blur", () => done(true));
  }
  buildLayerDetail();
  if (EDIT.on) setEdit(true);
}

// The picked shape's controls, nested under its row in the layer list.
function buildLayerDetail() {
  const wrap = $("layer-detail"), R = SCORE.layers[EDIT.layer], L = R?.clips?.[EDIT.clip];
  wrap.replaceChildren();
  if (!L || PANE_FOLD) return;
  const el = elementOf(L);
  wrap.insertAdjacentHTML("beforeend",
    `<div class="head"><span>${clipLabel(R, EDIT.clip)} <span class="dimmed">· ${el ? el.note : `no element called "${L.el}"`}</span></span>` +
    `<button class="mini" id="layer-remove" title="Take this shape off the square">×</button></div>`);
  $("layer-remove").addEventListener("click", () => {
    rememberScore();
    R.clips.splice(EDIT.clip, 1);
    EDIT.clip = null;
    buildLayers();
  });
  wrap.append(whenRow(L, "from", "from"), whenRow(L, "to", "until"));
  wrap.append(menuRow(L, "in", "comes in by", [["cut", "cutting in"], ["fade", "fading in"], ["clap", "a clap line"]], "cut"));
  wrap.append(menuRow(L, "out", "leaves by", [["cut", "cutting out"], ["fade", "fading out"], ["clap", "a clap line"]], "cut"));
  if (L.shape && !L.keys?.length) {
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.innerHTML = `<button class="btn" title="Bake the timing above into keyframes, then sculpt them freely">→ keys</button>`;
    seg.querySelector("button").addEventListener("click", (e) => { e.currentTarget.blur(); bakeKeys(); });
    wrap.append(seg);
  }
  if (L.shape && !L.keys?.length && (L.spots ?? el?.spots ?? []).length > 1) {
    wrap.append(menuRow(L, "spotsMode", "spots", [["all", "still — all show"], ["turns", "appear one per hit"], ["one", "one copy, moving"]], "all"));
    if ((L.spotsMode ?? "all") !== "all") {
      wrap.append(menuRow(L, "moveOn", "moves on", moveOnOptions(), ""));
      wrap.append(menuRow(L, "thenEvery", "then", [["stay", "stays put"], ["beat", "every beat"], ["bar", "every bar"]], "stay"));
      wrap.append(menuRow(L, "moveBars", "moving for", [["", "the whole time"], ["1", "1 bar"], ["2", "2 bars"], ["4", "4 bars"], ["8", "8 bars"], ["16", "16 bars"]], ""));
      if (L.spotsMode === "one") wrap.append(menuRow(L, "switchBy", "switches by", [["jump", "jumping"], ["blink", "blinking across"], ["slide", "sliding"]], "jump"));
    }
    const words = spotsWords(L);
    if (words) wrap.insertAdjacentHTML("beforeend", `<p class="note">${words}</p>`);
  }
  if (hasSpots(L)) {
    wrap.insertAdjacentHTML("beforeend",
      `<div class="spot-head"><span class="label" title="Places of this one ${layerName(L)}. Duplicate makes another shape.">Spots</span></div>`);
    (L.spots ?? el.spots).forEach((sp, i) => {
      const [x, y, size, flip = 1, deg = 0] = sp;
      const row = document.createElement("div");
      row.className = "spot-row" + (EDIT.spot === i ? " on" : "");
      row.innerHTML = `<span class="dimmed">${i + 1}</span>` +
        `<span>${Math.round(x * 100)}, ${Math.round(y * 100)}</span>` +
        `<span class="dimmed">×${round2(size)}</span>` +
        `<span>${deg ? `${deg}°` : ""}${flip === -1 ? " ⇄" : ""}</span>` +
        `<button class="mini" data-a="flip" title="Mirror (X)">⇄</button>` +
        `<button class="mini" data-a="turn" title="Turn 15° (Alt-click turns back)">↻</button>` +
        `<button class="mini" data-a="dup" title="Duplicate (D)">⧉</button>` +
        `<button class="mini" data-a="del" title="Remove">×</button>`;
      row.addEventListener("click", (e) => {
        const a = e.target.dataset.a;
        e.target.blur?.();
        EDIT.spot = i;
        if (a === "flip") flipSpot(i);
        else if (a === "turn") rotateSpot(i, e.altKey ? -15 : 15);
        else if (a === "dup") duplicateSpot(i);
        else if (a === "del") removeSpot(i);
        else buildLayerDetail();
      });
      wrap.append(row);
    });
  }
  // the clip's keyframes: when it is, where it is; → jumps the song there
  if (L.keys?.length) {
    wrap.insertAdjacentHTML("beforeend",
      `<div class="spot-head"><span class="label">Keys</span><span class="data dimmed">K sets one at the playhead</span>` +
      `<button class="mini" id="keys-clear" title="Remove all keys — the shape stops moving">×</button></div>`);
    $("keys-clear").addEventListener("click", (e) => {
      e.currentTarget.blur();
      rememberScore();
      delete L.keys;
      buildLayers();
    });
    L.keys.forEach((k, i) => {
      const row = document.createElement("div");
      row.className = "spot-row";
      row.innerHTML = `<span class="dimmed">${i + 1}</span>` +
        `<span>${atKeyWords(k.at)}</span>` +
        `<span class="dimmed">${Math.round(k.x * 100)}, ${Math.round(k.y * 100)}</span>` +
        `<span class="dimmed">×${round2(k.size)}</span>` +
        `<span class="dimmed">${k.fade != null && k.fade !== 1 ? `fade ${round2(k.fade)}` : ""}${k.flip === -1 ? " ⇄" : ""}${k.deg ? ` ${k.deg}°` : ""}</span>` +
        `<button class="mini" data-a="go" title="Play from this key">→</button>` +
        `<button class="mini" data-a="del" title="Remove">×</button>`;
      row.addEventListener("click", (e) => {
        const a = e.target.dataset.a;
        e.target.blur?.();
        if (a === "go") run(() => source.seek(beatsToMs(SCORE, keyBeat(SCORE, k.at))));
        else if (a === "del") {
          rememberScore();
          L.keys.splice(i, 1);
          if (!L.keys.length) delete L.keys;
          buildLayers();
        }
      });
      wrap.append(row);
    });
  }
  if (L.shape) {
    const row = document.createElement("label");
    row.className = "param";
    row.innerHTML = `<span>shape</span><span></span><select class="input shape-menu"></select>`;
    row.querySelector("select").addEventListener("change", (e) => {
      rememberScore();
      L.shape = e.target.value;
      e.target.blur();
      loadShape(L.shape);
      buildLayers();
    });
    wrap.append(row);
  }
  for (const [name, [def, min, max, step]] of Object.entries(el ? el.params : {})) {
    // on a keyed clip the size slider follows the one rule: it writes the key
    // under the playhead (in spot-size units, 0.1 per slider step)
    const keyed = name === "size" && L.keys?.length;
    const kNow = keyed ? parkedKey(L) ?? keyedPlace(SCORE, L.keys, Math.max(0, msToBeats(SCORE, songNow()))) : null;
    const val = keyed ? Math.min(max, Math.max(min, kNow.size / 0.1)) : L[name] ?? def;
    const dec = decimals(step);
    const row = document.createElement("label");
    row.className = "param";
    row.innerHTML = `<span>${keyed ? "size (the key's)" : name}</span><span class="val">${val.toFixed(dec)}</span>` +
      `<input type="range" min="${min}" max="${max}" step="${step}" value="${val}">`;
    const out = row.querySelector(".val"), slider = row.querySelector("input");
    slider.addEventListener("input", (e) => {
      if (!SLIDING) { rememberScore(); SLIDING = true; }
      const v = parseFloat(e.target.value);
      if (keyed) {
        const p = parkedKey(L) ?? keyedPlace(SCORE, L.keys, Math.max(0, msToBeats(SCORE, songNow())));
        keyThrough(L, [p.x, p.y, round4(0.1 * v), p.flip ?? 1, p.deg ? round2(p.deg) : 0]);
      } else L[name] = v;
      out.textContent = v.toFixed(dec);
    });
    slider.addEventListener("change", () => {
      SLIDING = false;
      if (keyed) buildLayerDetail();
    });
    wrap.append(row);
  }
  renderShapeMenus();
}

// The clip's spot behavior, compressed: what shows and what moves it.
function spotsWords(L) {
  const mode = L.spotsMode ?? "all";
  const n = (L.spots ?? elementOf(L)?.spots ?? []).length;
  if (mode === "all" || n < 2) return null;
  const on = { beat: "every beat", bar: "every bar", "": "nothing" }[L.moveOn ?? ""] ?? `"${L.moveOn}"`;
  const bits = [mode === "one" ? `1 copy · ${n} spots` : `${n} spots, one per hit`, `moves on ${on}`];
  if (L.thenEvery && L.thenEvery !== "stay") bits.push(`then every ${L.thenEvery}`);
  if (L.moveBars) bits.push(`first ${L.moveBars} bar${L.moveBars > 1 ? "s" : ""}`);
  return bits.join(" · ");
}

// A layer's start or end, in words.
function timeWords(L) {
  const w = (v, edge) => (v == null ? edge : typeof v === "string" ? v : `bar ${v}`);
  return `${w(L.from, "start")} → ${w(L.to, "end")}`;
}

// A menu for when a layer comes in or leaves: its bar, or any moment.
function whenRow(L, key, label) {
  const row = document.createElement("label");
  row.className = "param";
  row.innerHTML = `<span>${label}</span><span></span><select class="input"></select>`;
  const sel = row.querySelector("select");
  const bar = typeof L[key] === "number"
    ? L[key]
    : Math.max(1, Math.floor((momentStart(SCORE, L[key]) ?? 0) / SCORE.beatsPerBar) + 1);
  // "during <hold>" on the from row anchors both ends to the hold at once
  const duringSel = (m) => key === "from" && m.hold && L.from === m.name && L.to === m.name;
  const during = key === "from"
    ? (SCORE.moments || []).filter((m) => m.hold)
        .map((m) => `<option value="d:${m.name}"${duringSel(m) ? " selected" : ""}>during ${m.name}</option>`).join("")
    : "";
  sel.innerHTML = `<option value="#none"${L[key] == null ? " selected" : ""}>${key === "from" ? "the start" : "the end"}</option>` +
    `<option value="#bar"${typeof L[key] === "number" ? " selected" : ""}>bar ${bar}</option>` +
    (SCORE.moments || []).map((m) => `<option value="m:${m.name}"${L[key] === m.name && !duringSel(m) ? " selected" : ""}>${m.name}</option>`).join("") +
    during;
  sel.addEventListener("change", () => {
    rememberScore();
    if (sel.value === "#none") delete L[key];
    else if (sel.value.startsWith("d:")) L.from = L.to = sel.value.slice(2);
    else L[key] = sel.value === "#bar" ? bar : sel.value.slice(2);
    sel.blur();
    buildLayers();
  });
  return row;
}

// A plain menu row for a layer field; picking the default clears the field.
function menuRow(L, key, label, options, def) {
  const row = document.createElement("label");
  row.className = "param";
  row.innerHTML = `<span>${label}</span><span></span><select class="input"></select>`;
  const sel = row.querySelector("select");
  sel.innerHTML = options.map(([v, t]) => `<option value="${v}"${String(L[key] ?? def) === v ? " selected" : ""}>${t}</option>`).join("");
  sel.addEventListener("change", () => {
    rememberScore();
    if (sel.value === def) delete L[key];
    else L[key] = /^\d+$/.test(sel.value) ? Number(sel.value) : sel.value;
    sel.blur();
    buildLayers();
  });
  return row;
}

// What spots can move on: any moment's hits, or the song's own pulse and tracks.
function moveOnOptions() {
  return [
    ["", "nothing — stays put"],
    ...(SCORE.moments || []).map((m) => [m.name, m.name]),
    ["beat", "every beat"], ["bar", "every bar"], ["claps", "the claps"], ["bongos", "the bongos"],
  ];
}

// The shape menus list the library: the picked layer's, and "+ shape" to add one.
function renderShapeMenus() {
  const add = $("add-shape");
  if (add) add.innerHTML = `<option value="">+ shape…</option>` + ED.library.map((n) => `<option>${n}</option>`).join("");
  const menu = document.querySelector(".shape-menu"), L = SCORE.layers[EDIT.layer]?.clips?.[EDIT.clip];
  if (!menu || !L?.shape) return;
  const names = [...new Set([...ED.library, L.shape])].sort();
  menu.innerHTML = names.map((n) => `<option${n === L.shape ? " selected" : ""}>${n}</option>`).join("");
}

// A clip for a drawing, from the current bar for 8 bars, with one spot in the
// middle. It goes into the picked layer (or a new one) and gets picked itself.
function addShapeLayer(name) {
  rememberScore();
  const bar = Math.floor(Math.max(0, msToBeats(SCORE, songNow())) / SCORE.beatsPerBar) + 1;
  const clip = { shape: name, from: bar, to: Math.min(SCORE.bars, bar + 7), in: "fade", out: "fade", spots: [[0.5, 0.5, 0.15]] };
  let ri = EDIT.layer;
  if (ri == null || !SCORE.layers[ri]) {
    SCORE.layers.push({ name, clips: [] });
    ri = SCORE.layers.length - 1;
  }
  SCORE.layers[ri].clips.push(clip);
  EDIT.layer = ri;
  EDIT.clip = SCORE.layers[ri].clips.length - 1;
  buildLayers();
  return { ri, ci: EDIT.clip };
}

// ---- Color pulses --------------------------------------------------------------
// One card per pulse: which color breathes toward what, how long one breath is,
// the way back, and the two moments it runs between.

function renderPulses() {
  const list = SCORE.colorMoves ?? (SCORE.colorMoves = []);
  const momentOpts = (v, edge) => `<option value="">${edge}</option>` +
    (SCORE.moments || []).map((m) => `<option${m.name === v ? " selected" : ""}>${m.name}</option>`).join("");
  $("pulses").replaceChildren(...list.map((cm, i) => {
    const row = document.createElement("div");
    row.className = "pulse";
    row.innerHTML =
      `<div class="pulse-row"><select class="input" data-k="slot" title="Which color">` +
      ["ground", "glow", "line", "ink", "light"].map((x) => `<option${x === cm.slot ? " selected" : ""}>${x}</option>`).join("") +
      `</select><span class="data dimmed">to</span>` +
      `<input type="color" data-k="to" value="${/^#[0-9a-f]{6}$/i.test(cm.to) ? cm.to : "#ffffff"}" title="What it breathes toward">` +
      `<select class="input" data-k="beats" title="One breath">` +
      [1, 2, 4, 8, 16].map((b) => `<option value="${b}"${b === (cm.beats || 4) ? " selected" : ""}>${b} beats</option>`).join("") +
      `</select><button class="mini" data-k="del" title="Remove">×</button></div>` +
      `<div class="pulse-row"><select class="input" data-k="back" title="The way back">` +
      `<option value="snap"${cm.back !== "fade" ? " selected" : ""}>snaps back</option>` +
      `<option value="fade"${cm.back === "fade" ? " selected" : ""}>fades back</option></select>` +
      `<select class="input" data-k="from" title="From">${momentOpts(cm.from, "the start")}</select>` +
      `<select class="input" data-k="until" title="Until">${momentOpts(cm.until, "the end")}</select></div>`;
    row.addEventListener("change", (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      rememberScore();
      if (k === "beats") cm.beats = Number(e.target.value);
      else if (k === "from" || k === "until") { if (e.target.value) cm[k] = e.target.value; else delete cm[k]; }
      else cm[k] = e.target.value;
      e.target.blur?.();
    });
    row.querySelector('[data-k="del"]').addEventListener("click", () => {
      rememberScore();
      list.splice(i, 1);
      renderPulses();
    });
    return row;
  }));
}

function updatePanel(B) {
  if (document.body.classList.contains("bare")) return;
  const b = Math.max(0, B), bar = Math.floor(b / SCORE.beatsPerBar) + 1;
  setText("pos", `bar ${bar} · beat ${Math.floor(b % SCORE.beatsPerBar) + 1}`);
  setText("time", `${clockText(songNow())} / ${clockText(songMs(SCORE))}`);
  setText("play", source.playing ? "Pause" : "Play");
  $("play").classList.toggle("on", source.playing);
  setText("song-status", source.label);
  setText("grid", `${Math.round(SCORE.bpm * 100) / 100} BPM · bar 1 at ${(SCORE.firstDownbeatMs / 1000).toFixed(3)} s · ${SCORE.bars} bars`);
  setText("listen", Listen.on ? "Stop" : "Listen");
  $("listen").classList.toggle("on", Listen.on);
  if (Listen.status) setText("listen-status", Listen.status);
  const sec = [...SCORE.sections].reverse().find((x) => x.from <= bar);
  const pal = [...SCORE.colors].reverse().find(([from]) => from <= bar);
  setText("now", `${sec ? sec.name : "-"} · energy ${energyAt(WORLD, B).toFixed(2)} · ${pal ? pal[1] : "-"}`);
  LAYER_BOXES.forEach((row, ri) => row.classList.toggle("active", !!ACTIVE[ri]?.size));
}

function clockText(ms) {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

function decimals(step) {
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

// ---- Controls ----------------------------------------------------------------

function wireControls() {
  const button = (id, fn) => $(id).addEventListener("click", (e) => { fn(); e.currentTarget.blur(); });
  button("play", togglePlay);
  button("sound", toggleSound);
  button("hide", toggleBare);
  button("copy", copyScore);
  button("forget", forgetWork);
  button("edit", () => { setEdit(!EDIT.on); if (EDIT.on) { buildLayers(); revealLayerPanel(); } });
  // the spot toolbar over the square, acting on the selected spot
  button("sq-dup", duplicateClip);
  button("sq-flip", () => { if (EDIT.spot != null) flipSpot(EDIT.spot); });
  $("sq-turn").addEventListener("click", (e) => {
    if (EDIT.spot != null) rotateSpot(EDIT.spot, e.altKey ? -15 : 15);
    e.currentTarget.blur();
  });
  button("sq-order", () => { ORDER.next = 0; ORDER.at = millis(); });
  button("sq-del", () => { if (EDIT.spot != null) removeSpot(EDIT.spot); });
  button("sq-key", setKeyAtPlayhead);
  button("add-layer", () => {
    rememberScore();
    let n = SCORE.layers.length + 1;
    while (SCORE.layers.some((R) => R.name === `layer ${n}`)) n++;
    SCORE.layers.push({ name: `layer ${n}`, clips: [] });
    EDIT.layer = SCORE.layers.length - 1;
    EDIT.clip = null;
    LAY_RENAME = EDIT.layer;
    buildLayers();
  });
  // drag a layer row up or down the list to restack it
  $("layers").addEventListener("dragstart", (e) => {
    const row = e.target.closest?.(".lay-row");
    if (!row) return;
    ROW_DRAG = Number(row.dataset.ri);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", row.dataset.ri);
  });
  $("layers").addEventListener("dragover", (e) => {
    const row = e.target.closest(".lay-row");
    if (ROW_DRAG == null || !row) return;
    e.preventDefault();
    const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
    for (const x of $("layers").querySelectorAll(".lay-row")) x.classList.remove("drop-above", "drop-below");
    row.classList.add(above ? "drop-above" : "drop-below");
  });
  $("layers").addEventListener("drop", (e) => {
    const row = e.target.closest(".lay-row"), from = ROW_DRAG;
    ROW_DRAG = null;
    if (from == null || !row) return buildLayers();
    e.preventDefault();
    const j = Number(row.dataset.ri), r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
    const to = above ? (from < j ? j - 1 : j) : (from < j ? j : j + 1);
    if (to !== from) {
      rememberScore();
      const current = SCORE.layers[EDIT.layer], [moved] = SCORE.layers.splice(from, 1);
      SCORE.layers.splice(to, 0, moved);
      EDIT.layer = Math.max(0, SCORE.layers.indexOf(current));
    }
    buildLayers();
  });
  $("layers").addEventListener("dragend", () => { ROW_DRAG = null; buildLayers(); });
  $("add-shape").addEventListener("change", (e) => {
    const name = e.target.value;
    e.target.value = "";
    e.target.blur();
    if (!name) return;
    loadShape(name);
    addShapeLayer(name);
  });
  button("add-pulse", () => {
    rememberScore();
    (SCORE.colorMoves ??= []).push({ slot: "ground", to: "#ffffff", beats: 4, back: "snap" });
    renderPulses();
  });
  for (const b of document.querySelectorAll("[data-view]")) {
    b.addEventListener("click", (e) => { setView(b.dataset.view); e.currentTarget.blur(); });
  }
  document.addEventListener("keydown", (e) => {
    if (document.body.classList.contains("shapes")) { if (editorKey(e)) e.preventDefault(); return; }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && "zy".includes(e.key.toLowerCase()) && !e.target.matches("input, textarea, select")) {
      e.preventDefault();
      e.shiftKey || e.key.toLowerCase() === "y" ? redoScore() : undoScore();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.matches('input[type="text"], textarea')) return;
    if (e.key === " ") { e.preventDefault(); togglePlay(); return; }
    if (e.key.startsWith("Arrow") && e.target.matches("input, select")) return; // sliders keep their arrow keys
    const bar = Math.floor(Math.max(0, msToBeats(SCORE, songNow())) / SCORE.beatsPerBar) + 1;
    const section = SCORE.sections[Number(e.key) - 1];
    if (e.key === "ArrowLeft") seekBar(bar - 1);
    else if (e.key === "ArrowRight") seekBar(bar + 1);
    else if (/^[1-9]$/.test(e.key) && section) seekBar(section.from);
    else if (e.key === "t" || e.key === "T") { if (!e.repeat) tapDownbeat(e); }
    else if (e.key === "[") nudgeGrid(-10);
    else if (e.key === "]") nudgeGrid(10);
    else if (e.key === "e" || e.key === "E") { setEdit(!EDIT.on); if (EDIT.on) { buildLayers(); revealLayerPanel(); } }
    else if ((e.key === "Delete" || e.key === "Backspace") && (MO_HOVER != null || (inTimeline() && momentMarkerAt()))) {
      deleteMoment(MO_HOVER ?? momentMarkerAt().mi); // the moment under the pointer
    }
    else if ((e.key === "Delete" || e.key === "Backspace") && editing() && EDIT.spot != null) removeSpot(EDIT.spot);
    else if ((e.key === "Delete" || e.key === "Backspace") && !editing() && EDIT.layer != null) {
      const R = SCORE.layers[EDIT.layer];
      rememberScore();
      if (EDIT.clip != null && R?.clips[EDIT.clip]) { R.clips.splice(EDIT.clip, 1); EDIT.clip = null; }
      else SCORE.layers.splice(EDIT.layer, 1);
      buildLayers();
    } else if ((e.key === "x" || e.key === "X") && editing() && EDIT.spot != null) flipSpot(EDIT.spot);
    else if ((e.key === "d" || e.key === "D") && editing() && EDIT.clip != null) duplicateClip();
    else if ((e.key === "r" || e.key === "R") && editing() && EDIT.spot != null) rotateSpot(EDIT.spot, e.shiftKey ? -15 : 15);
    else if (e.key === "k" || e.key === "K") setKeyAtPlayhead();
    else if ((e.key === "p" || e.key === "P") && SCORE.moments?.[MO_OPEN]?.path) {
      PATH_PLAY = PATH_PLAY ? null : { mi: MO_OPEN, t0: millis() }; // preview the open drawing, or stop it
    }
    else if (e.key === "Escape" && MOMENT_MODE) setMomentMode(false);
    else if (e.key === "Escape" && editing() && EDIT.spot != null) EDIT.spot = null;
    else if (e.key === "Escape") undoTaps();
    else if (e.key === "m" || e.key === "M") { if (!e.repeat) setMomentMode(!MOMENT_MODE); }
    else if (e.key === "s" || e.key === "S") toggleSound();
    else if (e.key === "h" || e.key === "H") toggleBare();
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else return;
    e.preventDefault();
  });
}

function seekBar(bar) {
  const ms = beatsToMs(SCORE, barToBeats(SCORE, constrain(bar, 1, SCORE.bars)));
  run(() => source.seek(ms));
}

function togglePlay() {
  run(() => (source.playing ? source.pause() : source.play()));
}

function toggleSound() {
  const on = Sound.toggle();
  $("sound").textContent = on ? "Sound on" : "Sound off";
  $("sound").classList.toggle("on", on);
}

function toggleBare() {
  document.body.classList.toggle("bare");
  $("sq-toolbar").hidden = !editing() || !hasSpots(editLayer());
  if (canvasCursor) cursor(canvasCursor = "default");
  windowResized();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}

// ---- Song --------------------------------------------------------------------
// Stand-in, a file, or Spotify. Spotify needs a Client ID from your own Spotify
// app (developer.spotify.com/dashboard) and a one-time sign-in.

function wireSong(tab) {
  for (const b of document.querySelectorAll("[data-tab]")) {
    b.addEventListener("click", (e) => { songTab(b.dataset.tab); e.currentTarget.blur(); });
  }
  $("file-pick").addEventListener("click", (e) => { $("file-input").click(); e.currentTarget.blur(); });
  $("file-input").addEventListener("change", () => {
    const file = $("file-input").files[0];
    if (!file) return;
    useSource(FileSource);
    run(() => FileSource.load(file), FileSource);
  });

  $("sp-client").value = SpotifyAuth.saved().clientId || "";
  $("sp-client").addEventListener("change", () => SpotifyAuth.save({ clientId: $("sp-client").value.trim() }));
  // the song link is also remembered in this browser, so it's only pasted once
  SCORE.song.spotifyId = SCORE.song.spotifyId || SpotifyAuth.saved().trackId || "";
  $("sp-track").value = SCORE.song.spotifyId ? `https://open.spotify.com/track/${SCORE.song.spotifyId}` : "";
  $("sp-track").addEventListener("change", () => {
    const id = parseTrackId($("sp-track").value);
    if (id) { SCORE.song.spotifyId = id; SpotifyAuth.save({ trackId: id }); }
    setText("sp-state", id ? "Song set" : "Not a song link");
  });
  $("sp-redirect").textContent = SpotifyAuth.redirectUri();
  $("sp-connect").addEventListener("click", (e) => { e.currentTarget.blur(); connectSpotify(); });
  $("sp-tab").addEventListener("click", (e) => { e.currentTarget.blur(); useSource(SpotifyTab); run(() => SpotifyTab.start(), SpotifyTab); });
  $("sp-app").addEventListener("click", (e) => { e.currentTarget.blur(); useSource(SpotifyApp); });
  if (!shown["sp-state"]) setText("sp-state", SpotifyAuth.connected() ? "Connected" : "Not connected");
  songTab(tab);
}

// Which controls show under Song; Stand-in and a loaded file switch right away.
function songTab(name) {
  for (const b of document.querySelectorAll("[data-tab]")) b.classList.toggle("on", b.dataset.tab === name);
  $("file-ui").hidden = name !== "file";
  $("spotify-ui").hidden = name !== "spotify";
  if (name === "standIn") useSource(StandIn);
  if (name === "file" && FileSource.buffer) useSource(FileSource);
}

function useSource(next) {
  if (next === source) return;
  const prev = source;
  if (prev.playing) Promise.resolve().then(() => prev.pause()).catch(() => {});
  prev.deactivate?.();
  source = next;
  source.activate?.();
}

function connectSpotify() {
  const id = $("sp-client").value.trim();
  if (!id) return setText("sp-state", "Client ID first");
  SpotifyAuth.save({ clientId: id });
  try { sessionStorage.setItem("soundsquare.score", JSON.stringify(SCORE)); } catch {}
  SpotifyAuth.login(id).catch((e) => setText("sp-state", e.message));
}

// Signing in leaves the page and comes back. Slider and color changes are kept
// across the trip, then the sign-in finishes.
function restoreAfterSignIn() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code") && !q.has("error")) return false;
  try {
    const saved = JSON.parse(sessionStorage.getItem("soundsquare.score"));
    if (saved) Object.assign(SCORE, saved);
    sessionStorage.removeItem("soundsquare.score");
  } catch {}
  setText("sp-state", "Signing in…");
  SpotifyAuth.finishLogin().then((msg) => setText("sp-state", msg), (e) => setText("sp-state", e.message));
  return true;
}

// ---- Listening for the tempo -------------------------------------------------
// The studio hears the song through an audio input (BlackHole) and sets the
// grid itself (see listen.js and tempo.js). The first time, the browser asks
// for permission; after that the input list has names, and BlackHole is picked.

function wireListen() {
  $("listen").addEventListener("click", (e) => {
    e.currentTarget.blur();
    listenedFor = songKey(); // pressed by hand: don't start again by itself for this song
    if (Listen.on) Listen.stop();
    else startListening($("listen-device").value || storeGet(LISTEN_DEVICE));
  });
  $("listen-device").addEventListener("change", () => startListening($("listen-device").value));
  Listen.onLock = saveGrid;
}

async function startListening(deviceId) {
  try {
    await Listen.start(deviceId);
    const inputs = await Listen.inputs(), select = $("listen-device");
    select.replaceChildren(...inputs.map((d) => new Option(d.label || "Audio input", d.deviceId)));
    select.hidden = !inputs.length;
    const current = Listen.stream?.getAudioTracks()[0]?.getSettings().deviceId;
    const hole = inputs.find((d) => /blackhole/i.test(d.label));
    if (!deviceId && hole && hole.deviceId !== current) return startListening(hole.deviceId);
    select.value = current || "";
    storeSet(LISTEN_DEVICE, current || null);
  } catch (e) {
    if (e.name === "OverconstrainedError" && deviceId) return startListening(null); // that input is gone
    Listen.status = e.name === "NotAllowedError"
      ? "Mic access blocked"
      : `Can't listen: ${e.message}`;
  }
}

// ---- Each song's grid --------------------------------------------------------
// Once listening has locked a song's grid, it's kept in this browser and used
// again whenever that song plays. For a song without one, listening starts by
// itself, once the browser has been allowed to listen.

const GRIDS = "soundsquare.grids", LISTEN_DEVICE = "soundsquare.listenDevice";
let gridFor = null;     // the song whose saved grid is in use
let listenedFor = null; // the song listening last started for, by itself or by hand

function songKey() {
  if (source.trackId) return `spotify:${source.trackId}`;
  if (source === FileSource && FileSource.name) return `file:${FileSource.name}`;
  return null;
}

function saveGrid() {
  const key = songKey();
  if (!key) return;
  storeSet(GRIDS, { ...storeGet(GRIDS), [key]: { bpm: SCORE.bpm, firstDownbeatMs: SCORE.firstDownbeatMs } });
  gridFor = key;
}

// Every second: use the playing song's saved grid, or start listening for one.
async function followSong() {
  const key = songKey();
  if (!key || !source.playing) return;
  const saved = (storeGet(GRIDS) || {})[key];
  if (saved) {
    if (gridFor !== key && !Listen.on) {
      Object.assign(SCORE, saved);
      gridFor = key;
      Listen.status = "Saved grid";
    }
    return;
  }
  if (Listen.on || listenedFor === key || !(await mayListen())) return;
  listenedFor = key;
  startListening(storeGet(LISTEN_DEVICE));
}

async function mayListen() {
  try { return (await navigator.permissions.query({ name: "microphone" })).state === "granted"; } catch { return false; }
}

// ---- Tapping the grid --------------------------------------------------------
// While the song plays, tap T on every downbeat (the 1 of each bar). From the
// fourth tap on, the grid follows the taps: the BPM and where bar 1 falls.
// A pause of more than 6 seconds starts a new round. Esc undoes the last round.
// Once a tempo has been heard by listening, one tap is enough: it only says
// which beat is the 1.

const taps = { list: [], before: null };

function gridNow() {
  const { oneAt, shift, tapped } = Listen;
  return { bpm: SCORE.bpm, firstDownbeatMs: SCORE.firstDownbeatMs, listen: { oneAt, shift, tapped } };
}

function tapDownbeat(e) {
  const at = songNow() - (performance.now() - e.timeStamp); // when the key went down
  if (Listen.est) {
    taps.before = gridNow();
    Listen.tapOne(at);
    if (gridFor === songKey()) saveGrid();
    return setText("tap-status", "1 set");
  }
  const last = taps.list[taps.list.length - 1];
  if (last == null || at < last || at - last > 6000) {
    taps.list = [];
    taps.before = gridNow();
  }
  taps.list.push(at);
  const n = taps.list.length, fit = fitGrid(taps.list, SCORE.beatsPerBar);
  if (!fit) return setText("tap-status", `${n} tap${n > 1 ? "s" : ""}`);
  SCORE.bpm = Math.round(fit.bpm * 1000) / 1000;
  SCORE.firstDownbeatMs = Math.round(fit.firstDownbeatMs);
  saveGrid();
  setText("tap-status", `${n} taps · ±${Math.round(fit.rmsMs)} ms`);
}

function undoTaps() {
  if (!taps.before) return;
  const { listen, ...grid } = taps.before;
  Object.assign(SCORE, grid);
  Object.assign(Listen, listen);
  if (gridFor === songKey()) saveGrid();
  taps.list = [];
  taps.before = null;
  setText("tap-status", "Undone");
}

function nudgeGrid(ms) {
  SCORE.firstDownbeatMs = Math.round(SCORE.firstDownbeatMs + ms);
  if (gridFor === songKey()) saveGrid();
  setText("tap-status", `${ms > 0 ? "+" : "−"}${Math.abs(ms)} ms`);
}

// ---- Copy score.js -----------------------------------------------------------
// Writes the score back out (with any slider and color changes) in the same
// layout as score.js, one layer per line, so it can be pasted over the file.

const SCORE_HEADER = [
  "// sound-square score: what the square does, bar by bar.",
  "// Bar 1 is the first downbeat. Inside a bar, beats count from 0 (the downbeat) to 3.",
  "// Edit by hand, or tune with the studio's sliders and use \"Copy score.js\".",
];

const SCORE_NOTES = {
  song: ["The song. The Spotify id gets filled in when we connect Spotify."],
  bpm: ["Timing grid: a placeholder until we tap along to the real song."],
  energy: ["Energy from 0 to 1 at chosen bars; bars in between blend smoothly."],
  tracks: [
    "What happens in the music. A pattern lists beats inside one bar and repeats",
    "for every bar in `bars`. Holds are [bar, beat, length in beats].",
  ],
  palettes: ["Palettes share the same slots, so any two can blend."],
  colors: ["Which palette starts at which bar. Changes blend over colorFadeBars."],
  sections: ["Names for the timeline. Number keys 1-6 jump to them."],
  moments: [
    "Things you hear, marked on the song (M in the studio while it plays; held",
    "down, M marks a hold: [start, end] in beats, a span like the bongo section).",
    "Layers come in and leave on them, spots move on their hits, pulses run between them.",
    "Each can carry a note; hide: true keeps its marker off the timeline.",
  ],
  colorMoves: ["Color pulses: a palette slot breathing toward a color between two moments."],
  layers: [
    "Layers are named rows on the timeline, drawn bottom to top; each holds shape clips.",
    "A clip: el is a coded shape from assets/elements.js; shape is a drawing,",
    "shapes/<name>.svg, drawn at each of its spots. On from `from` through `to`:",
    "a bar number, or a moment's name to land right on it. in / out: \"cut\",",
    "\"fade\" or \"clap\". spotsMode: all (every spot), turns (one per hit of moveOn),",
    "one (a single copy moves between spots, switching by jump, blink or slide;",
    "moveBars caps the moving). A spot is [x, y, size]; add -1 to mirror it there,",
    "then degrees to turn it. hidden: true keeps a whole layer off the square.",
    "keys: [{ at, x, y, size, deg, fade, flip }] ease the clip's place over time",
    "(K in the studio); at is \"bar:beat\" or a moment's name; flip: -1 mirrors",
    "from that key on; ease: \"line\" keeps the approach linear. Keys replace the",
    "spot modes. keysFrom names the moment whose drawn path made them: editing",
    "that path in the studio re-samples the keys.",
  ],
};

function scoreToJS(score) {
  const out = [...SCORE_HEADER, "", "const SCORE = {"];
  for (const [key, value] of Object.entries(score)) {
    for (const note of SCORE_NOTES[key] || []) out.push(`  // ${note}`);
    out.push(`  ${key}: ${toJS(value, 1)},`);
  }
  out.push("};", "");
  return out.join("\n");
}

function toJS(v, depth) {
  if (typeof v === "number") return String(Math.round(v * 10000) / 10000);
  if (typeof v !== "object" || v === null) return JSON.stringify(v);
  const isList = Array.isArray(v);
  const parts = isList
    ? v.map((x) => toJS(x, depth + 1))
    : Object.entries(v).map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${toJS(x, depth + 1)}`);
  const one = isList ? `[${parts.join(", ")}]` : `{ ${parts.join(", ")} }`;
  if (one.length <= 96 && !one.includes("\n")) return one;
  const pad = "  ".repeat(depth), inner = "  ".repeat(depth + 1);
  return `${isList ? "[" : "{"}\n${parts.map((p) => `${inner}${p},`).join("\n")}\n${pad}${isList ? "]" : "}"}`;
}

function copyScore() {
  const text = scoreToJS(SCORE);
  const done = () => setText("copied", "Copied");
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    done();
  };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}
