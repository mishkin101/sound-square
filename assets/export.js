// sound-square export: the square as a video of the song, recorded while it
// plays — the loop's stretch if one is on, else the whole song from its start.
// The square is drawn straight into the video at its own size (1080 across),
// not copied off the screen, so it's as sharp as it can be; no overlays, no
// panels. The sound is the song when the studio can reach it: a song file
// straight from its playback, Spotify through the BlackHole loopback (as the
// waveform recording hears it), the stand-in none.
//
// To keep picture and sound together, the song plays in from two seconds
// before the stretch, so it is playing and its clock settled when recording
// starts right at the stretch's beginning; a song file's picture follows the
// sound it records rather than what the speakers will play later. It records
// in real time, so the tab stays in front.

const Export = {
  size: 1080,
  fps: 30,
  rec: null, // { recorder, chunks, ctx, type, startMs, endMs, recording, audio, last }

  get on() { return !!this.rec; },

  async toggle() {
    if (this.rec) return this.stop();
    const range = LOOP ? LOOP.map((b) => Math.max(0, beatsToMs(SCORE, b))) : [0, songMs(SCORE)];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.size;
    const stream = canvas.captureStream(this.fps);
    const audio = await this.sound();
    if (audio) stream.addTrack(audio.track);
    const type = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 20e6, audioBitsPerSecond: 192e3 });
    const rec = {
      recorder, chunks: [], ctx: canvas.getContext("2d"), type: recorder.mimeType || type,
      startMs: range[0], endMs: range[1], recording: false, audio, last: 0,
    };
    recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    recorder.onstop = () => this.save(rec);
    this.rec = rec;
    try {
      if (source.playing) await source.pause();
      await source.seek(Math.max(0, range[0] - 2000)); // play in, so it's settled at the start
      await source.play();
    } catch (e) {
      source.label = e.message;
      this.stop();
    }
  },

  // Each frame, with the song at beat B: recording starts once the song
  // reaches the stretch, and the square goes into the video at most `fps`
  // times a second; the end of the stretch, or the song stopping, ends it.
  frame(B) {
    const r = this.rec;
    if (!r) return;
    const now = songNow();
    if (!r.recording) {
      if (!source.playing || now < r.startMs - 1) return;
      this.render(B); // the first frame is in before the recorder starts
      r.recorder.start(1000);
      r.recording = true;
      r.last = performance.now();
      return;
    }
    if (now >= r.endMs || !source.playing) return this.stop();
    if (performance.now() - r.last >= 1000 / this.fps - 4) {
      this.render(B);
      r.last = performance.now();
    }
  },

  // The square drawn into the video canvas at full size: p5 draws through the
  // video's context for a moment, the square `size` units across, lines that
  // are sized in screen pixels kept in proportion, the picking flash left out.
  render(B) {
    const r = this.rec, rend = p5.instance._renderer, main = rend.drawingContext;
    const keep = { SQ, SQ_X, SQ_Y, flash: FLASH.until };
    const ctx = r.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    PX_REF = SQ;
    FLASH.until = 0;
    rend.drawingContext = ctx;
    window.drawingContext = ctx;
    rend._cachedFillStyle = rend._cachedStrokeStyle = undefined;
    SQ = this.size;
    SQ_X = SQ_Y = 0;
    try {
      renderSquare(B, 0, 0);
    } finally {
      rend.drawingContext = main;
      window.drawingContext = main;
      rend._cachedFillStyle = rend._cachedStrokeStyle = undefined;
      ({ SQ, SQ_X, SQ_Y } = keep);
      FLASH.until = keep.flash;
      PX_REF = null;
    }
  },

  stop() {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    if (r.recording && r.recorder.state !== "inactive") r.recorder.stop();
    else r.audio?.stop();
    if (source.playing) run(() => source.pause());
  },

  save(r) {
    r.audio?.stop();
    if (!r.chunks.length) return;
    const ext = r.type.includes("mp4") ? "mp4" : "webm";
    const t = new Date(), two = (n) => String(n).padStart(2, "0");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(r.chunks, { type: r.type }));
    a.download = `sound-square-${t.getFullYear()}${two(t.getMonth() + 1)}${two(t.getDate())}-${two(t.getHours())}${two(t.getMinutes())}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  },

  // The song's sound as a track to record, or null: a file's straight from its
  // playback, anything else through the BlackHole loopback when there is one.
  async sound() {
    if (source === StandIn) return null;
    if (source === FileSource && FileSource.ctx) {
      const dest = FileSource.ctx.createMediaStreamDestination();
      FileSource.tap = dest;
      return { track: dest.stream.getAudioTracks()[0], stop: () => { FileSource.tap = null; } };
    }
    try {
      const want = (id) => ({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      let inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      if (!inputs.some((d) => d.label)) { // names show once the browser may use an input
        (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
        inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      }
      const hole = inputs.find((d) => /blackhole/i.test(d.label));
      if (!hole) return null;
      const stream = await navigator.mediaDevices.getUserMedia(want(hole.deviceId));
      return { track: stream.getAudioTracks()[0], stop: () => stream.getTracks().forEach((t) => t.stop()) };
    } catch {
      return null;
    }
  },
};
