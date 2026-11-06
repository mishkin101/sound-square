// sound-square sources: where the song position comes from.
// Every source answers now() in song milliseconds, has play(), pause() and
// seek(ms), a `playing` flag, a `label` for the Song panel, and durationMs
// once the song's length is known. Spotify's two sources are in spotify.js.

// Follows a position that's only read now and then: counts forward locally
// between readings and re-anchors when a trustworthy reading disagrees.
function makeAnchor(tolerance) {
  return {
    pos: 0, at: 0, playing: false, last: null,
    now() { return this.playing ? this.pos + performance.now() - this.at : this.pos; },
    // a known position, e.g. right after play, pause or seek
    set(pos, playing, at = performance.now()) {
      this.pos = pos; this.at = at; this.playing = playing; this.last = null;
    },
    // a polled position, trusted only if it moved in step with the clock since the last poll
    reading(pos, playing, at = performance.now()) {
      if (!playing || !this.playing) return this.set(pos, playing, at);
      const last = this.last;
      this.last = { pos, at };
      if (!last || Math.abs(pos - last.pos - (at - last.at)) > 60) return;
      if (Math.abs(pos - (this.pos + at - this.at)) > tolerance) { this.pos = pos; this.at = at; }
    },
  };
}

// No audio: counts time locally, and loops so the score can run on its own.
const StandIn = {
  label: "No audio", loops: true, durationMs: null,
  anchor: makeAnchor(0),
  get playing() { return this.anchor.playing; },
  now() { return this.anchor.now(); },
  play() { this.anchor.set(this.anchor.now(), true); },
  pause() { this.anchor.set(this.anchor.now(), false); },
  seek(ms) { this.anchor.set(Math.max(0, ms), this.anchor.playing); },
};

// A song file on this computer, played through Web Audio for a steady clock.
const FileSource = {
  label: "No file", loops: false, durationMs: null,
  ctx: null, buffer: null, node: null, startedAt: 0, offset: 0, playing: false,

  async load(file) {
    this.ctx = this.ctx || new AudioContext();
    this.pause();
    this.label = `Loading ${file.name}…`;
    this.buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
    this.durationMs = this.buffer.duration * 1000;
    this.offset = 0;
    this.name = file.name;
    this.label = file.name;
  },

  rawNow() { return (this.ctx.currentTime - this.startedAt) * 1000; },

  // what you hear right now: the audio clock minus the output delay
  now() {
    if (!this.playing) return this.offset;
    const delay = ((this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) * 1000;
    return Math.max(0, this.rawNow() - delay);
  },

  play() {
    if (!this.buffer) throw new Error("Choose a file");
    if (this.playing) return;
    if (this.offset >= this.durationMs) this.offset = 0;
    this.ctx.resume();
    const node = this.ctx.createBufferSource();
    node.buffer = this.buffer;
    node.connect(this.ctx.destination);
    if (this.tap) node.connect(this.tap); // an export recording the sound
    node.onended = () => {
      if (this.node !== node) return;
      this.offset = this.durationMs;
      this.node = null;
      this.playing = false;
    };
    this.startedAt = this.ctx.currentTime - this.offset / 1000;
    node.start(0, this.offset / 1000);
    this.node = node;
    this.playing = true;
  },

  pause() {
    if (!this.playing) return;
    this.offset = Math.min(this.rawNow(), this.durationMs);
    this.node.onended = null;
    this.node.stop();
    this.node = null;
    this.playing = false;
  },

  seek(ms) {
    const was = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(ms, this.durationMs || 0));
    if (was) this.play();
  },
};
