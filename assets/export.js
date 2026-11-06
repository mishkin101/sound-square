// sound-square export: the square as a video of the song, recorded while it
// plays — the loop's stretch if one is on, else the whole song from its start.
// The picture is the square alone (no overlays, no panels), 1080 across; the
// sound is the song when the studio can reach it: a song file directly,
// Spotify through the BlackHole loopback (as the waveform recording hears it),
// the stand-in none. It records in real time, so the tab stays in front.

const Export = {
  size: 1080,
  rec: null, // { recorder, chunks, ctx, type, endMs, started, audio }

  get on() { return !!this.rec; },

  async toggle() {
    if (this.rec) return this.stop();
    const range = LOOP ? LOOP.map((b) => Math.max(0, beatsToMs(SCORE, b))) : [0, songMs(SCORE)];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.size;
    const stream = canvas.captureStream(30);
    const audio = await this.sound();
    if (audio) stream.addTrack(audio.track);
    const type = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
    const rec = { recorder, chunks: [], ctx: canvas.getContext("2d"), type: recorder.mimeType || type, endMs: range[1], started: false, audio };
    recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
    recorder.onstop = () => this.save(rec);
    this.rec = rec;
    try {
      if (source.playing) await source.pause();
      await source.seek(range[0]);
      recorder.start(1000);
      await source.play();
      rec.started = true;
    } catch (e) {
      source.label = e.message;
      this.stop();
    }
  },

  // Each frame: the square as just drawn (before any overlay), scaled in; the
  // end of the stretch, or the song stopping, ends the recording.
  frame(cnv, x, y, w) {
    const r = this.rec;
    if (!r?.started) return;
    const d = pixelDensity();
    r.ctx.drawImage(cnv, x * d, y * d, w * d, w * d, 0, 0, this.size, this.size);
    if (songNow() >= r.endMs || !source.playing) this.stop();
  },

  stop() {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    if (r.recorder.state !== "inactive") r.recorder.stop();
    else this.save(r);
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
