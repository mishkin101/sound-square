// sound-square + Spotify. Sign in once (PKCE: no secret, nothing leaves this
// computer but the sign-in itself), then follow the song's position either from
// a Spotify player inside this tab (Web Playback SDK, the tightest sync) or from
// the Spotify app (polling the Web API, looser). Both need Spotify Premium.

const SPOTIFY_SCOPES = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";
const SPOTIFY_STORE = "soundsquare.spotify";

function storeGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function storeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

function randomString(n) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => chars[x % chars.length]).join("");
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The track id from a song link (Share → Copy Song Link), a spotify:track: uri or a bare id.
function parseTrackId(text) {
  const m = String(text).trim().match(/(?:track[/:])?([A-Za-z0-9]{22})(?:[?&#\s]|$)/);
  return m ? m[1] : null;
}

const SpotifyAuth = {
  // Spotify only accepts 127.0.0.1 (not localhost) for a local redirect.
  redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ""); },
  saved() { return storeGet(SPOTIFY_STORE) || {}; },
  save(patch) { storeSet(SPOTIFY_STORE, { ...this.saved(), ...patch }); },
  connected() { return !!this.saved().refresh; },

  // Step 1: off to Spotify's sign-in page.
  async login(clientId) {
    const verifier = randomString(64), state = randomString(16);
    this.save({ clientId, verifier, state });
    const q = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SPOTIFY_SCOPES,
      code_challenge_method: "S256",
      code_challenge: await pkceChallenge(verifier),
      redirect_uri: this.redirectUri(),
      state,
    });
    location.assign(`https://accounts.spotify.com/authorize?${q}`);
  },

  // Step 2: back from Spotify with a code (or an error) in the address.
  async finishLogin() {
    const q = new URLSearchParams(location.search);
    history.replaceState(null, "", location.pathname);
    if (q.get("error")) return `Spotify: ${q.get("error")}`;
    const s = this.saved();
    if (!s.state || q.get("state") !== s.state) return "Sign-in failed";
    await this.tokenRequest({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: this.redirectUri(), code_verifier: s.verifier });
    this.save({ verifier: null, state: null });
    return "Connected";
  },

  async tokenRequest(params) {
    const s = this.saved();
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: s.clientId, ...params }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Sign-in failed: ${data.error_description || data.error || res.status}`);
    this.save({ access: data.access_token, refresh: data.refresh_token || s.refresh, expiresAt: Date.now() + data.expires_in * 1000 });
  },

  // A valid access token, refreshed shortly before it expires.
  async token() {
    const s = this.saved();
    if (!s.refresh) throw new Error("Not connected");
    if (s.access && Date.now() < s.expiresAt - 60000) return s.access;
    this.pending = this.pending || this.tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh }).finally(() => { this.pending = null; });
    await this.pending;
    return this.saved().access;
  },
};

async function spotifyApi(method, path, body) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${await SpotifyAuth.token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 202 || res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (res.ok) return data;
  const reason = data?.error?.reason, message = data?.error?.message || `error ${res.status}`;
  if (reason === "NO_ACTIVE_DEVICE") throw new Error("No active Spotify device");
  if (res.status === 403) throw new Error(`Spotify refused: ${message}`);
  if (res.status === 429) throw new Error("Spotify: too many requests");
  throw new Error(`Spotify: ${message}`);
}

function loadSpotifySdk() {
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.onerror = () => reject(new Error("Player didn't load"));
    document.head.append(script);
  });
}

function trackLabel(track) {
  return track ? `${track.name} · ${track.artists.map((a) => a.name).join(", ")}` : "Ready";
}

// A Spotify player inside this tab. Its position is local, so sync is tight.
const SpotifyTab = {
  label: "Not started", loops: false, durationMs: null, trackId: null,
  anchor: makeAnchor(40), player: null, deviceId: null, starting: null,
  get playing() { return this.anchor.playing; },
  now() { return this.anchor.now(); },

  start() {
    this.starting = this.starting || this.boot().catch((e) => { this.starting = null; throw e; });
    return this.starting;
  },

  async boot() {
    this.label = "Starting…";
    await loadSpotifySdk();
    const p = new Spotify.Player({
      name: "sound-square",
      volume: 0.8,
      getOAuthToken: (cb) => SpotifyAuth.token().then(cb, (e) => { this.label = e.message; }),
    });
    this.player = p;
    p.addListener("player_state_changed", (st) => this.onState(st));
    p.addListener("not_ready", () => { this.deviceId = null; this.label = "Player offline"; });
    const problems = {
      initialization_error: "Use Chrome",
      authentication_error: "Sign-in expired",
      account_error: "Needs Premium",
      playback_error: "Can't play that",
    };
    for (const [event, text] of Object.entries(problems)) p.addListener(event, ({ message }) => { this.label = text; console.warn(event, message); });
    p.activateElement?.();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Player didn't start · try Spotify app")), 15000);
      p.addListener("ready", ({ device_id }) => { clearTimeout(timer); this.deviceId = device_id; resolve(); });
      p.connect().then((ok) => { if (!ok) { clearTimeout(timer); reject(new Error("Player didn't connect")); } });
    });
    this.label = trackLabel(null);
    setInterval(() => this.poll().catch(() => {}), 1000);
  },

  onState(st) {
    if (!st) return;
    this.anchor.set(st.position, !st.paused);
    const track = st.track_window?.current_track;
    this.trackId = track?.linked_from?.id || track?.id || null;
    this.durationMs = st.duration || track?.duration_ms || null;
    this.label = trackLabel(track);
  },

  async poll() {
    const st = await this.player?.getCurrentState();
    if (st) this.anchor.reading(st.position, !st.paused);
  },

  async play() {
    await this.start();
    const id = SCORE.song.spotifyId;
    if (id && this.trackId !== id) {
      await spotifyApi("PUT", `/me/player/play?device_id=${this.deviceId}`, { uris: [`spotify:track:${id}`], position_ms: Math.round(this.anchor.now()) });
    } else if (this.trackId) {
      await this.player.resume();
    } else {
      throw new Error("Paste a song link");
    }
  },
  async pause() { await this.player?.pause(); },
  async seek(ms) { this.anchor.set(ms, this.anchor.playing); await this.player?.seek(Math.round(ms)); },
};

// Follow the Spotify app (or any device) by asking the Web API where it is.
// Looser than the in-tab player: expect around 100 ms of wobble.
const SpotifyApp = {
  label: "Following Spotify app", loops: false, durationMs: null, trackId: null,
  anchor: makeAnchor(80), timer: null, busy: false,
  get playing() { return this.anchor.playing; },
  now() { return this.anchor.now(); },
  activate() { if (!this.timer) { this.poll(); this.timer = setInterval(() => this.poll(), 1000); } },
  deactivate() { clearInterval(this.timer); this.timer = null; },

  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const t0 = performance.now();
      const data = await spotifyApi("GET", "/me/player");
      const at = (t0 + performance.now()) / 2; // assume Spotify answered halfway through the request
      if (!data?.item) {
        this.anchor.set(this.anchor.now(), false);
        this.label = "Nothing playing";
        return;
      }
      this.anchor.reading(data.progress_ms, data.is_playing, at);
      this.trackId = data.item.linked_from?.id || data.item.id;
      this.durationMs = data.item.duration_ms;
      this.label = trackLabel(data.item);
    } catch (e) {
      this.label = e.message;
    } finally {
      this.busy = false;
    }
  },

  async play() {
    const id = SCORE.song.spotifyId, fresh = id && this.trackId !== id;
    await spotifyApi("PUT", "/me/player/play", fresh ? { uris: [`spotify:track:${id}`], position_ms: 0 } : undefined);
    this.anchor.set(fresh ? 0 : this.anchor.now(), true);
  },
  async pause() { await spotifyApi("PUT", "/me/player/pause"); this.anchor.set(this.anchor.now(), false); },
  async seek(ms) { await spotifyApi("PUT", `/me/player/seek?position_ms=${Math.round(ms)}`); this.anchor.set(ms, this.anchor.playing); },
};
