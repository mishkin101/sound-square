// sound-square waveform: the song's loudness over time, drawn on the timeline.
// A local file gives the real thing: its samples, bucketed to levels. Spotify
// never hands over audio (DRM), so its waveform comes from the audio-analysis
// API — per-segment loudness, shaped into the same buckets. Either way the
// result is cached in this browser per song, like a grid.

const Waveform = {
  N: 1536,      // buckets across the whole song
  data: null,   // the current song's buckets, each 0..1
  ms: null,     // the song length the buckets cover
  for: null,    // the song key the buckets belong to
  busy: false,  // an analysis fetch in flight
  failed: null, // the song key whose fetch failed, so it isn't retried forever

  STORE: "soundsquare.waves",
  stored() { return storeGet(this.STORE) || {}; },
  keep(key, buckets, ms) {
    const top = Math.max(...buckets, 0.001);
    const v = buckets.map((b) => Math.round((b / top) * 100) / 100);
    storeSet(this.STORE, { ...this.stored(), [key]: { v, ms: ms ?? this.ms } });
    this.for = null;
    this.load(key);
  },

  // the cached waveform for a song, if any (older saves were a bare list)
  load(key) {
    if (this.for === key) return;
    this.for = key;
    const got = key && this.stored()[key];
    this.data = (Array.isArray(got) ? got : got?.v) || null;
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

  // the level at a song position, 0..1 (null without a waveform)
  at(frac) {
    if (!this.data) return null;
    return this.data[Math.max(0, Math.min(this.N - 1, Math.floor(frac * this.N)))] ?? 0;
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
    let stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      video: false,
    });
    // no device asked for: prefer BlackHole (the song's loopback) over the mic
    if (!deviceId) {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      const hole = inputs.find((d) => /blackhole/i.test(d.label));
      const current = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (hole && hole.deviceId !== current) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: hole.deviceId } }, video: false });
      }
    }
    const ctx = new AudioContext();
    await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const kept = this.stored()[key];
    const base = (Array.isArray(kept) ? kept : kept?.v) ?? new Array(this.N).fill(0);
    const rec = (this.rec = {
      key, stream, ctx, base,
      raw: new Array(this.N).fill(0), top: 0.004, savedAt: 0, level: 0,
      device: stream.getAudioTracks()[0]?.label || "default input",
    });
    rec.merge = () => rec.base.map((b, i) => Math.max(b, rec.raw[i] / rec.top));
    rec.timer = setInterval(() => {
      const now = keyNow();
      if (now && now !== key) return this.stopRecording(); // a different song took over
      const frac = posFrac();
      if (frac == null) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0, n = 0;
      for (let s = 0; s < buf.length; s += 4) { sum += buf[s] * buf[s]; n++; }
      const v = Math.sqrt(sum / n);
      rec.level = v;
      rec.top = Math.max(rec.top, v);
      const i = Math.max(0, Math.min(this.N - 1, Math.floor(frac * this.N)));
      rec.raw[i] = Math.max(rec.raw[i], v);
      this.data = rec.merge(); // drawn as it fills
      if (performance.now() - rec.savedAt > 3000) {
        rec.savedAt = performance.now();
        const { rec: r } = this;
        this.keep(key, rec.merge(), durMs());
        this.rec = r; // keep() reloads from the store; the recording carries on
        this.data = rec.merge();
      }
    }, 100);
  },

  stopRecording() {
    const r = this.rec;
    if (!r) return;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close();
    this.rec = null;
    if (r.top > 0.004) this.keep(r.key, r.merge()); // heard something: keep it (ms already saved along the way)
  },
};
