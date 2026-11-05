// Preview sounds, so the score can be heard without the song: a click on every
// beat (higher on the downbeat), a blip for each clap and bongo, and a soft tone
// while keys are held. Only for checking timing; the real audio comes from Spotify.

const Sound = {
  on: false, ctx: null, noise: null, last: null, hold: null, holdIdx: -1,

  toggle() {
    this.on = !this.on;
    if (this.on) this.start(); else this.stopHold();
    return this.on;
  },

  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.ctx.resume();
  },

  // Called every frame: plays whatever the playhead crossed since the last frame.
  update(score, world, B, playing) {
    const prev = this.last;
    this.last = B;
    if (!this.on || !playing) { this.stopHold(); return; }
    if (prev == null || B <= prev || B - prev > 0.5) return; // a seek, not playback
    for (let k = Math.floor(prev) + 1; k <= B; k++) if (k >= 0) this.click(k % score.beatsPerBar === 0);
    const crossed = (name) => {
      const h = world.tracks[name]?.hits || [], out = [];
      for (let i = lastIndex(h, prev) + 1; i < h.length && h[i] <= B; i++) out.push(i);
      return out;
    };
    for (const i of crossed("bongos")) this.bongo(i % 2 === 1);
    if (crossed("claps").length) this.clap();
    const holds = world.tracks.keys?.holds || [];
    const idx = holds.findIndex((h) => B >= h.s && B < h.e);
    if (idx !== this.holdIdx) {
      this.stopHold();
      if (idx >= 0) this.startHold();
      this.holdIdx = idx;
    }
  },

  out(node, peak, decay) {
    const t = this.ctx.currentTime, g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    node.connect(g);
    g.connect(this.ctx.destination);
  },

  click(accent) {
    const t = this.ctx.currentTime, o = this.ctx.createOscillator();
    o.frequency.value = accent ? 1760 : 1320;
    this.out(o, accent ? 0.2 : 0.1, 0.04);
    o.start(t);
    o.stop(t + 0.05);
  },

  bongo(high) {
    const t = this.ctx.currentTime, o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(high ? 420 : 300, t);
    o.frequency.exponentialRampToValueAtTime(high ? 300 : 210, t + 0.12);
    this.out(o, 0.35, 0.16);
    o.start(t);
    o.stop(t + 0.2);
  },

  clap() {
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter();
    src.buffer = this.noise;
    f.type = "bandpass";
    f.frequency.value = 1500;
    src.connect(f);
    this.out(f, 0.5, 0.18);
    src.start(t);
    src.stop(t + 0.25);
  },

  startHold() {
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 220;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    this.hold = { o, g };
  },

  stopHold() {
    this.holdIdx = -1;
    if (!this.hold) return;
    const t = this.ctx.currentTime, { o, g } = this.hold;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.stop(t + 0.35);
    this.hold = null;
  },
};
