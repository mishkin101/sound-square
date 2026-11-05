// sound-square tempo: finds a song's beat by listening to it.
// Audio becomes an onset curve: how suddenly the sound gets louder, 100 times a
// second, in a low band (kicks) and a high band (claps, hats). The tempo is the
// beat spacing that lands on the most onsets across everything heard so far, so
// the longer it listens, the more exact it gets.

const ONSET_RATE = 100; // onset values per second
const BANDS = 6;        // band levels kept per onset step, for finding the 1

// Turns blocks of audio into the onset curve, keeping filter state between blocks.
// It also keeps the loudness of six bands (below 150 Hz, 400, 1k, 2.5k, 6k, above),
// one after another in `bands`.
function makeOnsets(sampleRate) {
  const hop = Math.round(sampleRate / ONSET_RATE);
  const pole = (hz) => 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
  const k150 = pole(150), k400 = pole(400), k1k = pole(1000), k2k5 = pole(2500), k6k = pole(6000);
  let l1 = 0, l2 = 0, a400 = 0, a1k = 0, h1 = 0, a6k = 0, n = 0, eLow = 0, eHigh = 0, prevLow = null, prevHigh = null;
  const e = new Float64Array(BANDS);
  const out = { hopMs: (hop / sampleRate) * 1000, curve: [], level: [], bands: [] };
  out.push = (samples) => {
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      l1 += k150 * (x - l1);
      l2 += k150 * (l1 - l2); // two passes for a steeper low band
      a400 += k400 * (x - a400);
      a1k += k1k * (x - a1k);
      h1 += k2k5 * (x - h1); // what's left above it is the high band
      a6k += k6k * (x - a6k);
      eLow += l2 * l2;
      eHigh += (x - h1) * (x - h1);
      e[0] += l1 * l1;
      let d = a400 - l1; e[1] += d * d;
      d = a1k - a400; e[2] += d * d;
      d = h1 - a1k; e[3] += d * d;
      d = a6k - h1; e[4] += d * d;
      d = x - a6k; e[5] += d * d;
      if (++n < hop) continue;
      const low = Math.log(1e-8 + eLow / hop), high = Math.log(1e-8 + eHigh / hop);
      out.curve.push(prevLow == null ? 0 : Math.max(0, low - prevLow) + 0.5 * Math.max(0, high - prevHigh));
      out.level.push((eLow + eHigh) / hop);
      for (let j = 0; j < BANDS; j++) { out.bands.push(Math.log(1e-8 + e[j] / hop)); e[j] = 0; }
      prevLow = low;
      prevHigh = high;
      eLow = eHigh = n = 0;
    }
  };
  return out;
}

// The steady tempo that best fits an onset curve: { bpm, firstBeat (in onset
// steps from the start), confidence }, or null with under 8 seconds to go on.
function estimateTempo(curve, hopMs, minBpm = 70, maxBpm = 180) {
  const n = curve.length;
  if (n * hopMs < 8000) return null;
  const g = onsetPeaks(curve, hopMs);
  const period = (bpm) => 60000 / bpm / hopMs; // onset steps per beat

  // 1. Rough tempo: the spacing at which the curve best matches itself, leaning
  //    gently toward 120 BPM so half and double tempos lose close calls.
  const lo = Math.floor(period(maxBpm)), hi = Math.ceil(period(minBpm)), ac = [];
  for (let lag = lo - 1; lag <= 2 * hi + 1 && lag < n; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += g[i] * g[i + lag];
    ac[lag] = s / (n - lag);
  }
  let bestLag = lo, best = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    const bpm = 60000 / (lag * hopMs);
    const score = (ac[lag] + 0.5 * (ac[2 * lag] || 0)) * Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.7) ** 2);
    if (score > best) { best = score; bestLag = lag; }
  }
  const bend = ac[bestLag - 1] - 2 * ac[bestLag] + ac[bestLag + 1];
  const lag = bestLag + (bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (ac[bestLag - 1] - ac[bestLag + 1])) / bend)) : 0);

  // 2. Exact tempo and phase: the beat grid that lands on the most onset,
  //    searched coarsely, then finely around the best.
  let top = { bpm: 60000 / (lag * hopMs), ...combFit(g, lag) };
  for (const [span, step] of [[1.5, 0.05], [0.06, 0.002]]) {
    const center = top.bpm;
    for (let bpm = center - span; bpm <= center + span + 1e-9; bpm += step) {
      const r = combFit(g, period(bpm));
      if (r.score > top.score) top = { bpm, ...r };
    }
  }
  // Music made on a computer usually sits on a whole BPM: take it if it fits as well.
  const whole = Math.round(top.bpm);
  if (Math.abs(whole - top.bpm) < 0.05) {
    const r = combFit(g, period(whole));
    if (r.score >= 0.985 * top.score) top = { bpm: whole, ...r };
  }
  return { bpm: top.bpm, firstBeat: top.phase, confidence: top.confidence };
}

// Which beat is the 1: an index (0-3) counting from the beat at `firstBeat`
// (in onset steps, `period` apart), with a margin over the runner-up. The
// backbeat (claps, snares) lands on 2 and 4, and the music changes most on the
// 1: parts come in or drop out there, above all at the start of a phrase.
function findDownbeat(onsets, firstBeat, period) {
  const { bands } = onsets, steps = bands.length / BANDS, at = (h, j) => bands[h * BANDS + j];
  const beats = [];
  for (let t = firstBeat; t + period < steps - 1; t += period) beats.push(Math.round(t));
  if (beats.length < 16) return null; // four bars at least
  // how sharply the clap bands (1k-6k) jump right at each beat
  const clap = beats.map((h) => {
    let up = 0;
    for (let i = Math.max(1, h - 1); i <= Math.min(steps - 1, h + 3); i++) up = Math.max(up, at(i, 3) + at(i, 4) - at(i - 1, 3) - at(i - 1, 4));
    return up;
  });
  // each beat's band levels, and how much they change across it: the two beats
  // after against the two before, so a clap on every other beat evens out
  const level = beats.map((h, k) => {
    const end = k + 1 < beats.length ? beats[k + 1] : h + Math.round(period), m = new Float64Array(BANDS);
    for (let i = h; i < end; i++) for (let j = 0; j < BANDS; j++) m[j] += at(i, j) / (end - h);
    return m;
  });
  const change = beats.map((_, k) => {
    if (k < 2 || k + 1 >= beats.length) return 0;
    let s = 0;
    for (let j = 0; j < BANDS; j++) s += ((level[k][j] + level[k + 1][j] - level[k - 1][j] - level[k - 2][j]) / 2) ** 2;
    return Math.sqrt(s);
  });
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const spread = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1; };
  const every = (xs, q, n) => xs.filter((_, k) => k % n === q);
  // above 0: the claps fall on odd beats, so the 1 is an even one
  const backbeat = (mean(every(clap, 1, 2)) - mean(every(clap, 0, 2))) / spread(clap);
  // the biggest changes, where phrases start
  const biggest = change.map((c, k) => [c, k]).sort((a, b) => b[0] - a[0]).slice(0, Math.max(4, Math.round(beats.length / 10)));
  const scores = [0, 1, 2, 3].map((q) =>
    (q % 2 === 0 ? backbeat : -backbeat) +
    (mean(every(change, q, 4)) - mean(change)) / spread(change) +
    (2 * biggest.filter(([, k]) => k % 4 === q).length) / biggest.length);
  const order = [0, 1, 2, 3].sort((a, b) => scores[b] - scores[a]);
  return { beat: order[0], margin: scores[order[0]] - scores[order[1]] };
}

// What stands out from its surroundings (a quarter second either side),
// softened a little so onsets a step or two apart still meet.
function onsetPeaks(curve, hopMs) {
  const n = curve.length, w = Math.round(250 / hopMs), prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + curve[i];
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
    raw[i] = Math.max(0, curve[i] - (prefix[b] - prefix[a]) / (b - a));
  }
  const kernel = [];
  for (let d = -4; d <= 4; d++) kernel.push(Math.exp(-(d * d) / 4.5)); // sigma 1.5 steps
  const total = kernel.reduce((s, x) => s + x, 0), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = -4; d <= 4; d++) s += (raw[i + d] || 0) * kernel[d + 4];
    out[i] = s / total;
  }
  return out;
}

// How well a beat grid with period p (in onset steps) fits: the best phase,
// its average onset per beat, and how far it stands above the other phases.
function combFit(g, p) {
  const n = g.length;
  const at = (ph) => {
    let s = 0, k = 0;
    for (let t = ph; t < n - 1; t += p, k++) { const i = t | 0; s += g[i] + (g[i + 1] - g[i]) * (t - i); }
    return k ? s / k : 0;
  };
  let best = -Infinity, phase = 0, sum = 0, sum2 = 0, count = 0;
  for (let ph = 0; ph < p; ph += 0.5) {
    const s = at(ph);
    sum += s; sum2 += s * s; count++;
    if (s > best) { best = s; phase = ph; }
  }
  // a finer phase from the two neighbours
  const wrap = (ph) => ((ph % p) + p) % p;
  const a = at(wrap(phase - 0.5)), c = at(wrap(phase + 0.5)), bend = a - 2 * best + c;
  if (bend < 0) phase = wrap(phase + Math.max(-0.25, Math.min(0.25, (0.25 * (a - c)) / bend)));
  const mean = sum / count, sd = Math.sqrt(Math.max(1e-12, sum2 / count - mean * mean));
  return { score: best, phase, confidence: (best - mean) / sd };
}
