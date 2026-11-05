// sound-square elements: the shapes from the sketchbook page.
//
// Each element draws inside the unit square: (0, 0) is the top-left corner,
// (1, 1) the bottom-right. `params` are its sliders: name: [default, min, max, step].
// `spots`, if an element has them, are places on the square you can drag in Edit
// mode (E): [x, y, size] each. A layer's own `spots` in score.js replace these.
// draw(P, s, L) gets the layer's values P, this frame's state s (beats, energy,
// colors, events; see frameState in engine.js) and the layer's own timing L
// (L.age = beats since it came in, L.local = beats since its first bar).

const ELEMENTS = {
  ground: {
    note: "Slow pulse",
    always: true,
    params: { pulseBars: [2, 0.5, 8, 0.5], pulse: [0.7, 0, 1, 0.05] },
    draw(P, s) {
      const k = 0.5 - 0.5 * Math.cos((s.B / (P.pulseBars * s.bpb)) * TWO_PI);
      noStroke();
      fill(mix(s.col.ground, s.col.glow, k * P.pulse));
      rect(0, 0, 1, 1);
    },
  },

  eyes: {
    note: "Eyes open one by one, look around, blink",
    // where the eyes sit, in the order they open: [x, y, size]
    spots: [[0.11, 0.11, 0.055], [0.89, 0.11, 0.055], [0.89, 0.89, 0.055], [0.11, 0.89, 0.055]],
    params: { size: [1, 0.25, 3, 0.05], everyBars: [1, 0.25, 4, 0.25], look: [0.4, 0, 0.5, 0.05] },
    draw(P, s, L) {
      P.spots.forEach(([x, y, size], i) => {
        const age = L.age - i * P.everyBars * s.bpb;
        if (age < 0) return;
        const r = size * P.size * easeOutBack(age); // pops open over one beat
        // one blink at a random moment in every two bars
        const cycle = Math.floor(s.B / 8), d = s.B - (cycle * 8 + 1 + hash(i, cycle) * 6);
        const blink = d > 0 && d < 0.35 ? Math.sin((Math.PI * d) / 0.35) : 0;
        push();
        translate(x, y);
        scale(1, 1 - 0.9 * blink);
        stroke(s.col.line); strokeWeight(px(2.5)); fill(s.col.light);
        circle(0, 0, 2 * r);
        // the pupil drifts, as if looking around
        const dir = noise(i * 7.3, s.B * 0.06) * 4 * Math.PI;
        const off = P.look * r * noise(i * 3.1 + 40, s.B * 0.09);
        noStroke(); fill(s.col.ink);
        circle(Math.cos(dir) * off, Math.sin(dir) * off, r * 0.95);
        pop();
      });
    },
  },

  bongoLine: {
    note: "Bongo hits plant bars",
    params: { y: [0.86, 0.5, 0.97, 0.01], growBars: [8, 1, 16, 1], height: [0.07, 0.02, 0.2, 0.005], rise: [0.7, 0, 2, 0.05], barWidth: [0.008, 0.002, 0.03, 0.001], inset: [0.06, 0, 0.2, 0.01] },
    draw(P, s, L) {
      const grow = P.growBars * s.bpb, x0 = P.inset, x1 = 1 - P.inset;
      noStroke();
      for (const [i, t] of s.hits("bongos", L.T.s, s.B)) {
        const u = (t - L.T.s) / grow, pass = Math.floor(u);
        const x = x0 + (u - pass) * (x1 - x0);
        const h = P.height * (0.35 + 0.65 * s.energyAt(t)) * (1 + P.rise * pass) * (0.55 + 0.45 * hash(i, 11));
        const hh = h * (1 + 0.9 * kick(s.B - t, 4)); // springs up on the hit, then settles
        fill(pass % 2 ? s.col.ink : s.col.line);
        rect(x - P.barWidth / 2, P.y - hh, P.barWidth, hh);
      }
      // the line itself: "line is clap", so it thickens on every clap
      const len = Math.min(1, L.local / grow);
      stroke(s.col.ink); strokeCap(SQUARE);
      strokeWeight(px(2 + 4 * kick(s.since("claps"), 5)));
      line(x0, P.y, x0 + len * (x1 - x0), P.y);
    },
  },

  triangles: {
    note: "Kicks on every beat",
    params: { x: [0.2, 0.05, 0.95, 0.01], y: [0.3, 0.05, 0.95, 0.01], size: [0.15, 0.05, 0.3, 0.005], count: [3, 1, 6, 1], kick: [0.3, 0, 0.8, 0.05] },
    draw(P, s) {
      const n = Math.round(P.count), w = P.size, h = P.size * 0.8, gap = h * 0.62;
      for (let i = 0; i < n; i++) {
        // each triangle fires a moment after the one below it
        const t = s.B - i * 0.09, beat = Math.floor(t);
        const accent = ((beat % s.bpb) + s.bpb) % s.bpb === 0 ? 1.4 : 1;
        const k = kick(t - beat, 5) * accent, sc = 1 + P.kick * k;
        push();
        translate(P.x, P.y + ((n - 1) / 2 - i) * gap);
        scale(sc);
        stroke(s.col.line); strokeWeight(px(2.5) / sc);
        fill(rgba(s.col.line, Math.min(1, 0.12 + 0.75 * k)));
        triangle(-w / 2, h / 2, w / 2, h / 2, 0, -h / 2);
        pop();
      }
    },
  },

  bongoBoxes: {
    note: "Bongos take turns",
    params: { size: [0.1, 0.04, 0.25, 0.005], inset: [0.05, 0, 0.2, 0.005], jump: [0.035, 0, 0.12, 0.005] },
    draw(P, s) {
      const last = s.last("bongos");
      for (const side of [0, 1]) {
        // the left box takes even hits, the right box odd ones
        const i = last ? (last.i % 2 === side ? last.i : last.i - 1) : -1;
        const t = s.hitTime("bongos", i), k = kick(t == null ? null : s.B - t, 6);
        const x = side ? 1 - P.inset - P.size : P.inset;
        stroke(s.col.line); strokeWeight(px(2.5));
        fill(rgba(s.col.line, 0.1 + 0.75 * k));
        rect(x, 1 - P.inset - P.size - P.jump * k, P.size, P.size);
      }
    },
  },

  divider: {
    note: "Splits 1/3 · 2/3",
    params: { x: [0.333, 0.1, 0.9, 0.001] },
    draw(P, s, L) {
      stroke(s.col.ink); strokeCap(SQUARE);
      strokeWeight(px(2.5 + 3 * kick(s.since("claps"), 5)));
      line(P.x, 0, P.x, easeOut(L.age));
    },
  },

  clapBongos: {
    note: "! on claps · o on bongos",
    params: { left: [0, 0, 1, 0.01], right: [0.333, 0, 1, 0.001], cols: [2, 1, 4, 1], rows: [4, 1, 8, 1], fadeBeats: [6, 1, 16, 0.5] },
    draw(P, s, L) {
      const w = P.right - P.left;
      // the clap mark: a bar over a dot
      const c = kick(s.since("claps"), 4);
      push();
      translate(P.left + w / 2, 0.24);
      scale(1 + 0.25 * c);
      noStroke(); fill(mix(s.col.line, s.col.ink, c));
      rect(-0.012, -0.11, 0.024, 0.14, 0.012);
      circle(0, 0.075, 0.032);
      pop();
      // the bongo circles
      const cols = Math.round(P.cols), rows = Math.round(P.rows), slots = cols * rows;
      const top = 0.42, gx = w / (cols + 1), gy = Math.min(gx, (0.8 - top) / rows), r = Math.min(gx, gy) * 0.36;
      noStroke();
      for (const [i, t] of s.hits("bongos", Math.max(L.T.inAt, s.B - P.fadeBeats), s.B)) {
        const age = s.B - t, slot = i % slots;
        fill(rgba(s.col.line, 0.9 * (1 - age / P.fadeBeats)));
        circle(P.left + gx * (1 + (slot % cols)), top + gy * (0.5 + Math.floor(slot / cols)), 2 * r * easeOutBack(age / 0.25));
      }
    },
  },

  dreamTones: {
    note: "Dreamy tones fade in and out",
    params: { left: [0.333, 0, 1, 0.001], right: [1, 0, 1, 0.01], perBeat: [2, 0.5, 8, 0.5], chance: [0.55, 0, 1, 0.05], holdBeats: [1, 0, 8, 0.25], fadeBeats: [3, 0.5, 12, 0.5], glow: [0.5, 0, 1, 0.05] },
    draw(P, s, L) {
      const step = 1 / P.perBeat, life = 0.25 + P.holdBeats + P.fadeBeats;
      const x0 = P.left + 0.04, x1 = P.right - 0.04;
      const first = Math.ceil((Math.max(L.T.inAt, s.B - life) - L.T.s) / step), last = Math.floor(L.local / step);
      noStroke();
      for (let k = first; k <= last; k++) {
        const t = L.T.s + k * step, age = s.B - t;
        if (hash(k, 1) > P.chance * (0.6 + 0.6 * s.energyAt(t))) continue;
        const a = age < 0.25 ? age / 0.25 : 1 - Math.max(0, age - 0.25 - P.holdBeats) / P.fadeBeats;
        if (a <= 0) continue;
        const w = 0.035 + hash(k, 2) * 0.06, h = 0.1 + hash(k, 3) * 0.32;
        const c = s.col.dreamy[Math.floor(hash(k, 6) * s.col.dreamy.length)];
        drawingContext.shadowBlur = P.glow * SQ * 0.05;
        drawingContext.shadowColor = rgba(c, a);
        fill(rgba(c, 0.92 * a));
        rect(x0 + hash(k, 4) * Math.max(0, x1 - x0 - w), 0.06 + hash(k, 5) * (0.82 - h), w, h, 0.004);
      }
      drawingContext.shadowBlur = 0;
    },
  },

  fringes: {
    note: "Held keys push the rings out",
    params: { x: [0.3, 0, 1, 0.01], y: [0.74, 0, 1, 0.01], size: [0.15, 0.05, 0.35, 0.005], rings: [7, 2, 14, 1], spread: [0.07, 0.01, 0.2, 0.005], wobble: [0.4, 0, 1, 0.05], attack: [2, 0.25, 8, 0.25], release: [3, 0.25, 12, 0.25] },
    draw(P, s) {
      const level = s.hold("keys", P.attack, P.release), n = Math.round(P.rings);
      for (let i = n - 1; i >= 0; i--) {
        // the inner rings are always there; the outer ones appear as the keys push
        const show = i < 3 ? 1 : clamp01(level * (n - 2) - (i - 3));
        if (show <= 0) continue;
        const R = P.size + i * (0.012 + P.spread * level);
        // a shaded core, then contour lines
        if (i === 0) { noStroke(); fill(rgba(s.col.ink, 0.85)); }
        else { noFill(); stroke(rgba(s.col.line, show * (1 - (0.5 * i) / n))); strokeWeight(px(i === 1 ? 3 : 2)); }
        beginShape();
        for (let j = 0; j < 96; j++) {
          const th = (j / 96) * TWO_PI;
          const nz = noise(Math.cos(th) * 0.9 + 5, Math.sin(th) * 0.9 + 5, s.B * 0.04 + i * 0.05);
          const r = R * (1 + P.wobble * (nz - 0.5));
          vertex(P.x + Math.cos(th) * r, P.y + Math.sin(th) * r * 0.85);
        }
        endShape(CLOSE);
      }
    },
  },

  hangers: {
    note: "Hang and sway",
    params: { x: [0.66, 0, 1, 0.01], count: [3, 1, 6, 1], length: [0.32, 0.05, 0.7, 0.01], sway: [0.05, 0, 0.2, 0.005] },
    draw(P, s, L) {
      const n = Math.round(P.count), drop = easeOutBack(L.age / 2);
      for (let i = 0; i < n; i++) {
        const w = 0.035 + hash(i, 21) * 0.03, h = P.length * (0.45 + 0.55 * hash(i, 22)) * drop;
        const swing = Math.sin((s.B * Math.PI) / 4 + i * 1.7) * P.sway * (0.4 + s.energy);
        const nudge = 0.015 * (i % 2 ? 1 : -1) * kick(s.beat, 5);
        push();
        translate(P.x + i * 0.085 + w / 2, 0);
        rotate(swing + nudge);
        stroke(s.col.line); strokeWeight(px(2.5));
        fill(rgba(s.col.dreamy[(i + 1) % s.col.dreamy.length], 0.85));
        rect(-w / 2, -0.02, w, h + 0.02);
        pop();
      }
    },
  },
};
