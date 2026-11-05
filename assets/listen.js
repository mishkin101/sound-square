// sound-square listening: hears the song through an audio input and keeps the
// grid on its beat. Spotify's audio can't be read directly, but with BlackHole
// the Mac's own output comes back in as an input, whichever app is playing.

// Runs on the audio thread: passes the input along in blocks, each stamped with
// the audio-clock time just after its last sample.
const TAP_WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0];
    if (ch && ch.length) {
      const a = ch[0], b = ch[1] || ch[0];
      for (let i = 0; i < a.length; i++) {
        this.buf[this.n++] = 0.5 * (a[i] + b[i]);
        if (this.n === this.buf.length) {
          this.port.postMessage({ samples: this.buf, end: currentTime + (i + 1) / sampleRate }, [this.buf.buffer]);
          this.buf = new Float32Array(2048);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("sound-square-tap", Tap);
`;

const Listen = {
  on: false, status: "", label: "", ctx: null, stream: null, input: null, node: null, ready: false,
  onsets: null, startMs: null, nextMs: null, analyzedAt: 0,
  est: null,     // the latest tempo heard: { bpm, firstBeatMs, confidence }
  oneAt: null,   // song time of a beat that's the 1 of its bar
  shift: 0,      // 0.5 when the 1 sits between the beats it heard (it locked onto the off-beats)
  tapped: false, // whether a tap has said where the 1 is (it then wins over what's heard)
  looks: [],     // the grid after each look, to tell when it has settled
  onLock: null,  // called once the grid has settled

  context() { return (this.ctx = this.ctx || new AudioContext()); },

  // Listens on an audio input: a device id from inputs(), or the default input.
  async start(deviceId) {
    this.stop();
    Object.assign(this, { est: null, oneAt: null, shift: 0, tapped: false, looks: [] });
    await this.context().resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await this.begin(this.ctx.createMediaStreamSource(this.stream), this.stream.getAudioTracks()[0].label);
  },

  // Listens to any audio node in this context.
  async begin(input, label) {
    if (!this.ready) {
      await this.context().audioWorklet.addModule(URL.createObjectURL(new Blob([TAP_WORKLET], { type: "text/javascript" })));
      this.ready = true;
    }
    this.node = new AudioWorkletNode(this.ctx, "sound-square-tap", { outputChannelCount: [1] });
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    input.connect(this.node);
    this.node.connect(mute).connect(this.ctx.destination); // keeps the audio thread pulling, silently
    this.node.port.onmessage = (e) => this.take(e.data);
    this.input = input;
    this.label = label || "the audio input";
    this.restart();
    this.on = true;
    this.status = "Listening…";
  },

  stop() {
    if (!this.on) return;
    this.on = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.disconnect();
    this.input?.disconnect();
    this.stream = this.node = this.input = null;
    this.status = "Stopped";
  },

  async inputs() {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  },

  restart() {
    this.onsets = makeOnsets(this.context().sampleRate);
    this.startMs = this.nextMs = null;
    this.drifts = [];
    this.analyzedAt = 0;
  },

  // how far the blocks' own readings sit from where the recording places them (the median)
  drift() {
    if (!this.drifts?.length) return 0;
    const sorted = [...this.drifts].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  },

  // A block of audio. It's placed in song time, so the beats it hears line up
  // with the song position; a pause or a jump starts a fresh recording. Each
  // block's own reading of where it sits is a little uneven (more so as audio
  // starts up), so the recording follows the middle of all of them.
  take({ samples, end }) {
    if (!this.on) return;
    if (!source.playing || scrubMs != null) {
      if (this.startMs != null) this.restart();
      this.status = "Waiting for the song";
      return;
    }
    const blockMs = (samples.length / this.ctx.sampleRate) * 1000;
    const heardAt = songNow() - (this.ctx.currentTime - end) * 1000; // song time just after this block
    if (this.startMs == null || Math.abs(heardAt - (this.nextMs + blockMs + this.drift())) > 150) {
      this.restart();
      this.startMs = this.nextMs = heardAt - blockMs;
    }
    this.nextMs += blockMs;
    this.drifts.push(heardAt - this.nextMs);
    if (this.drifts.length > 400) this.drifts.shift();
    this.onsets.push(samples);
    const heard = this.nextMs - this.startMs;
    if (heard - this.analyzedAt >= 3000) {
      this.analyzedAt = heard;
      this.analyze(heard);
    }
  },

  analyze(heard) {
    const { curve, level, hopMs } = this.onsets, secs = Math.round(heard / 1000);
    if (Math.max(...level.slice(-300)) < 1e-7) {
      this.status = "No sound. Output set to Multi-Output?";
      return;
    }
    const from = Math.max(0, curve.length - 18000); // the last three minutes at most
    const r = estimateTempo(curve.slice(from), hopMs);
    if (!r || r.confidence < 2.5) {
      this.status = `Listening · ${secs} s · no beat yet`;
      return;
    }
    const firstBeat = from + r.firstBeat, period = 60000 / r.bpm / hopMs;
    this.est = { bpm: r.bpm, firstBeatMs: this.startMs + this.drift() + (firstBeat + 0.5) * hopMs, confidence: r.confidence };
    const one = this.tapped ? null : findDownbeat(this.onsets, firstBeat, period);
    if (one) { this.oneAt = this.est.firstBeatMs + (one.beat * 60000) / r.bpm; this.shift = 0; }
    this.apply();
    // done once the tempo and the 1 have held still for three looks in a row
    // (or after two minutes, going with the best guess)
    const bar = (4 * 60000) / SCORE.bpm, look = { bpm: SCORE.bpm, first: SCORE.firstDownbeatMs };
    this.looks.push(look);
    const recent = this.looks.slice(-3);
    const settled = recent.length === 3 && recent.every((l) => {
      const d = Math.abs(l.first - look.first) % bar;
      return Math.abs(l.bpm - look.bpm) < 0.01 && Math.min(d, bar - d) < 15;
    });
    if (heard >= 45000 && (settled || heard >= 120000)) return this.lock(settled ? "" : " · the 1 is a guess");
    this.status = `Listening · ${secs} s`;
  },

  lock(note) {
    this.stop();
    this.status = `Locked · saved${note}`;
    this.onLock?.();
  },

  // Puts the grid on what was heard, keeping the chosen 1 where it was.
  apply() {
    const e = this.est, beat = 60000 / e.bpm, bar = beat * SCORE.beatsPerBar;
    const base = e.firstBeatMs + this.shift * beat;
    const one = base + Math.round(((this.oneAt ?? base) - base) / beat) * beat;
    this.oneAt = one;
    SCORE.bpm = Math.round(e.bpm * 1000) / 1000;
    SCORE.firstDownbeatMs = Math.round(((one % bar) + bar) % bar);
  },

  // A tap on a 1 (only needed if what was heard is wrong): the nearest half
  // beat to it becomes the 1 of its bar.
  tapOne(at) {
    const e = this.est, half = Math.round((at - e.firstBeatMs) / (30000 / e.bpm));
    this.shift = Math.abs(half % 2) * 0.5;
    this.oneAt = e.firstBeatMs + (half * 30000) / e.bpm;
    this.tapped = true;
    this.apply();
  },
};

// "126" for a whole tempo, "122.38" otherwise.
function bpmText(bpm) { return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(2); }
