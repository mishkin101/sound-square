// sound-square waveform: the song's loudness over time, drawn on the timeline.
// A local file gives the real thing: its samples, bucketed to levels. Spotify
// never hands over audio (DRM), so its waveform comes from the audio-analysis
// API — per-segment loudness, shaped into the same buckets. Either way the
// result is cached in this browser per song, like a grid. A recording also
// keeps the pitch: per bucket, how high the sound sits (its spectral centroid
// on a log-frequency scale, 80 Hz to 6 kHz, as 0..1; 0 is not heard yet).

const Waveform = {
  N: 6144,      // buckets across the whole song (~67 ms each on a 7-minute song)
  data: null,   // the current song's buckets, each 0..1
  pitch: null,  // the current song's pitch buckets, each 0..1 (0: not heard)
  ms: null,     // the song length the buckets cover
  for: null,    // the song key the buckets belong to
  busy: false,  // an analysis fetch in flight
  failed: null, // the song key whose fetch failed, so it isn't retried forever

  STORE: "soundsquare.waves",
  stored() { return storeGet(this.STORE) || {}; },
  keep(key, buckets, ms, pitch) {
    const top = Math.max(...buckets, 0.001);
    const v = buckets.map((b) => Math.round((b / top) * 100) / 100);
    const p = pitch ? pitch.map((x) => Math.round(x * 1000) / 1000) : this.stored()[key]?.p;
    storeSet(this.STORE, { ...this.stored(), [key]: { v, ms: ms ?? this.ms, ...(p ? { p } : {}) } });
    this.for = null;
    this.load(key);
  },

  // the cached waveform for a song, if any (older saves were a bare list)
  load(key) {
    if (this.for === key) return;
    this.for = key;
    const got = key && this.stored()[key];
    this.data = (Array.isArray(got) ? got : got?.v) || null;
    this.pitch = (!Array.isArray(got) && got?.p) || null;
    this.ms = (!Array.isArray(got) && got?.ms) || null;
  },

  // A decoded file: RMS level per bucket, over every channel.
  fromBuffer(key, buffer) {
    const N = this.N, out = new Array(N).fill(0), chs = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
    const per = Math.floor(buffer.length / N), step = Math.max(1, Math.floor(per / 64));
    for (let i = 0; i < N; i++) {
      let sum = 0, n = 0;
      for (let s = i * per; s < (i + 1) * per; s += step) for (const ch of chs) { sum += ch[s] * ch[s]; n++; }
      out[i] = Math.sqrt(sum / Math.max(1, n));
    }
    this.keep(key, out, buffer.duration * 1000);
  },

  // Spotify's audio analysis: each segment's peak loudness (dB), as a level.
  async fromSpotify(key, id) {
    const a = await spotifyApi("GET", `/audio-analysis/${id}`);
    const segs = a?.segments, total = a?.track?.duration;
    if (!segs?.length || !total) throw new Error("Spotify sent no segments");
    const N = this.N, out = new Array(N).fill(0);
    const level = (db) => Math.pow(10, Math.max(-60, Math.min(0, db ?? -60)) / 20);
    for (const s of segs) {
      const v = level(s.loudness_max ?? s.loudness_start);
      const from = Math.max(0, Math.floor((s.start / total) * N));
      const to = Math.min(N - 1, Math.floor(((s.start + s.duration) / total) * N));
      for (let i = from; i <= to; i++) out[i] = Math.max(out[i], v);
    }
    this.keep(key, out, total * 1000);
  },

  // the level at a song position, 0..1 (null without a waveform). Buckets
  // stay stepped on purpose: a level change reads as a clean edge.
  at(frac) {
    const d = this.data;
    if (!d) return null;
    return d[Math.max(0, Math.min(d.length - 1, Math.floor(frac * d.length)))] ?? 0;
  },

  // The pitch over a stretch of the song (fractions of it), weighted by how
  // loud each bucket is, so the hit itself outweighs the quiet around it.
  // Null where nothing was heard.
  pitchNear(fa, fb) {
    const p = this.pitch, v = this.data;
    if (!p) return null;
    const n = p.length, i0 = Math.max(0, Math.floor(fa * n)), i1 = Math.min(n - 1, Math.floor(fb * n));
    let sum = 0, w = 0;
    for (let i = i0; i <= i1; i++) {
      if (!(p[i] > 0)) continue;
      const wi = (v ? v[Math.floor((i / n) * v.length)] ?? 0 : 1) + 0.001;
      sum += p[i] * wi;
      w += wi;
    }
    return w ? sum / w : null;
  },

  // an older save at another resolution, stretched onto n buckets
  resample(list, n) {
    if (!list) return new Array(n).fill(0);
    if (list.length === n) return [...list];
    return Array.from({ length: n }, (_, i) => list[Math.floor((i / n) * list.length)] ?? 0);
  },

  // ---- Recording through the audio input ---------------------------------------
  // When Spotify refuses its analysis, the song is still audible through the
  // audio input (BlackHole): record() fills in whatever the playhead passes
  // over while the song plays, merges it with anything already kept, and saves
  // as it goes. It only ever starts from ⇧W — never by itself. posFrac gives
  // the playhead as a fraction of the song (null while paused); keyNow names
  // the current song, so a song change stops the recording.
  rec: null,

  async record(key, deviceId, posFrac, keyNow, durMs) {
    this.stopRecording();
    const audio = (dev) => ({
      deviceId: dev ? { exact: dev } : undefined,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    });
    let stream = await navigator.mediaDevices.getUserMedia({ audio: audio(deviceId) });
    // no device asked for: prefer BlackHole (the song's loopback) over the mic
    if (!deviceId) {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      const hole = inputs.find((d) => /blackhole/i.test(d.label));
      const current = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (hole && hole.deviceId !== current) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({ audio: audio(hole.deviceId) });
      }
    }
    const ctx = new AudioContext();
    await ctx.resume();
    const kept = this.stored()[key];
    const base = this.resample(Array.isArray(kept) ? kept : kept?.v, this.N);
    const pBase = this.resample(Array.isArray(kept) ? null : kept?.p, this.N);
    const rec = (this.rec = {
      key, stream, ctx, base, pBase,
      raw: new Array(this.N).fill(0), top: 0.004, savedAt: 0, level: 0,
      pSum: new Array(this.N).fill(0), pW: new Array(this.N).fill(0),
      device: stream.getAudioTracks()[0]?.label || "default input",
    });
    rec.merge = () => rec.base.map((b, i) => Math.max(b, rec.raw[i] / rec.top));
    // this take's pitch wherever it heard something; the kept pitch elsewhere
    rec.pitchMerge = () => rec.pBase.map((b, i) => (rec.pW[i] > 0 ? rec.pSum[i] / rec.pW[i] : b));
    // The capture rides the audio clock, not a timer: a background tab's
    // timers crawl, but audio blocks keep coming, so the whole song records.
    const node = ctx.createScriptProcessor(2048, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const input = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    input.connect(node);
    input.connect(analyser);
    node.connect(mute).connect(ctx.destination); // keeps the audio thread pulling, silently
    analyser.connect(mute);
    rec.node = node;
    const spec = new Float32Array(analyser.frequencyBinCount), binHz = ctx.sampleRate / analyser.fftSize;
    const k0 = Math.ceil(80 / binHz), k1 = Math.min(spec.length - 1, Math.floor(6000 / binHz));
    const LO = Math.log2(80), SPAN = Math.log2(6000) - LO;
    node.onaudioprocess = (e) => {
      if (this.rec !== rec) return;
      const now = keyNow();
      if (now && now !== key) return this.stopRecording(); // a different song took over
      const frac = posFrac();
      if (frac == null) return;
      const ch = e.inputBuffer.getChannelData(0);
      let sum = 0, n = 0;
      for (let s = 0; s < ch.length; s += 4) { sum += ch[s] * ch[s]; n++; }
      const v = Math.sqrt(sum / n);
      rec.level = v;
      rec.top = Math.max(rec.top, v);
      const i = Math.max(0, Math.min(this.N - 1, Math.floor(frac * this.N)));
      rec.raw[i] = Math.max(rec.raw[i], v);
      // pitch: the spectrum's center of mass in octaves, weighted by loudness
      if (v > 0.002) {
        analyser.getFloatFrequencyData(spec);
        let num = 0, den = 0;
        for (let k = k0; k <= k1; k++) {
          const m = Math.pow(10, spec[k] / 20);
          num += m * Math.log2(k * binHz);
          den += m;
        }
        if (den > 0) {
          rec.pSum[i] += Math.min(1, Math.max(0.001, (num / den - LO) / SPAN)) * v;
          rec.pW[i] += v;
        }
      }
      this.data = rec.merge(); // drawn as it fills
      this.pitch = rec.pitchMerge();
      if (performance.now() - rec.savedAt > 3000) {
        rec.savedAt = performance.now();
        this.keep(key, rec.merge(), durMs(), rec.pitchMerge());
        this.rec = rec; // keep() reloads from the store; the recording carries on
        this.data = rec.merge();
        this.pitch = rec.pitchMerge();
      }
    };
  },

  stopRecording() {
    const r = this.rec;
    if (!r) return;
    if (r.node) { r.node.onaudioprocess = null; r.node.disconnect(); }
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close();
    this.rec = null;
    if (r.top > 0.004) this.keep(r.key, r.merge(), undefined, r.pitchMerge()); // heard something: keep it
  },
};
