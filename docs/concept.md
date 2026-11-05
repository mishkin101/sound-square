# sound-square: concept

> Status: first draft. The studio plays the sketches on placeholder timing. Spotify comes later.

## Why
I sketch what I see while a song plays: shapes inside a square, how they move, the colors. sound-square turns those sketches into a living square that moves, changes color and reacts to the music, in sync with the track playing on Spotify.

## How it works
The square is a function of song time: given a position, it always draws the same frame. Playing, scrubbing and syncing to Spotify are all the same thing.

```
song position (ms) → beats (bar 12, beat 3) → the layers that are on → the square
```

- **Timing grid**: BPM and where bar 1 starts turn milliseconds into bars and beats.
- **Tracks**: what happens in the music (claps, bongos, held keys) as beat times. A pattern repeats every bar; single hits and holds can be listed one by one.
- **Layers**: each sketched element, on from one bar to another, with a way in and out: cut, fade, or clap.
- **Palettes**: named color sets with the same slots (ground, glow, line, ink, light, five dreamy tones). Changes blend in OKLCH, which keeps in-between colors vivid. An RGB blend from blue to yellow passes through grey; OKLCH passes through teal.
- **Energy**: a 0-1 curve across the song that some elements follow.

Everything about the song lives in `score.js`. The shapes live in `assets/elements.js`.

## From the sketches
The top of the page holds the elements ([sketch-elements.webp](sketches/sketch-elements.webp)). Going down the page is what happens as the song plays ([sketch-sequence.webp](sketches/sketch-sequence.webp)).

| Sketch | Note on the page | Layers | Driven by |
|---|---|---|---|
| 1 | eye in each corner · background color slow pulse | `ground`, `eyes` | the ground pulses every 2 bars; eyes open one per bar, look around, blink |
| 2 | follow bongo shape · line grows left → right · follows energy | `bongoLine` | each bongo hit plants a bar where the line has reached; taller with more energy |
| 2b | (cut off in the photo) the line continues, the bongos come up | `bongoLine`, second pass | each new pass the bars come up taller |
| 3 | "beat" for triangles · transition: clap | `triangles`, `bongoBoxes` | triangles kick on every beat; the boxes take turns on bongo hits; the scene leaves on a clap |
| 4 | 2/3 of space for randomized bright dreamy tones · 1/3 for ! → oooo "bongos" | `divider`, `clapBongos`, `dreamTones` | the ! flashes on claps, bongo hits drop circles, tones appear at random |
| 5 | fringes grow out and in with longer key press | `fringes`, `hangers` | held keys push the rings out; they settle back in after |

Colors: a salmon pink ground, teal lines (the pencil color), bright dreamy pastels for the tones. Two more palettes, *dream* (from the split) and *deep* (from the fringes), show the color changing across sections.

## Readings to check
- **Transition: clap**: read as the change from the triangles to the split, landing on the first clap of the new section, with a clap line sweeping down the square.
- **Longer key press**: read as held notes on keys in the song. They are `tracks.keys.holds` in `score.js`, and could also be recorded live by holding a key while listening, like a range in the Marker.
- **! → oooo**: the ! flashes on claps; each bongo hit drops a circle into the grid.
- **2b** is cut off in the photo, so its note is a guess.
- **Placeholders**: section lengths (8 bars each), the 120 BPM grid, the bongo and clap patterns, the key holds and the extra palettes.
- **Not placed yet**: the rising arrows, the hatched shape ("like on cereal boxes"), the barcode lines and the column of circles.

## Spotify
- Spotify gives the playback position, not bars, beats or audio. Audio Features and Audio Analysis (tempo, bars, beats) are closed to new apps (since late 2024), and the stream is DRM-protected.
- So the studio **listens**: BlackHole sends the Mac's output back in as an input. Every 3 seconds the studio turns what it heard into an onset curve (kick band plus clap/hat band) and finds the beat spacing and phase that land on the most onsets. The estimate sharpens the longer it listens. On a synthetic house loop it came within 0.08 BPM after 12 s, 0.02 after 30 s and 0.009 after 60 s, with the beat within about 4 ms. Because what it hears comes out of the same output as the speakers, the grid also absorbs the output delay.
- **The 1** is found the same way: claps land on 2 and 4, and the music changes most on the 1 (parts entering or leaving, new phrases). A whole-number tempo wins when it fits as well. Once the tempo and the 1 hold still, listening stops and the grid is saved for that song. In synthetic tests it found the right 1 every time, starting mid-bar, with or without claps.
- **Interface text**: keep it short. Labels and statuses are a few words.
- **Web Playback SDK** makes the browser tab the player, for the tightest sync. It needs Premium. One unconfirmed report says it stopped connecting for some Development Mode apps after the February 2026 changes, so test it first.
- Fallback: poll the Web API (`GET /v1/me/player`) while the desktop app plays. It works with any device but is looser, roughly 100 ms or worse.
- **Development Mode** (since February 2026): personal, non-commercial projects; Premium; one Client ID; up to 5 users.
- **Policy**: Spotify's Developer Policy restricts synchronizing recordings with visual media. Keep the Spotify-synced version private, and read the policy before hosting it publicly or recording it to video.
- **Offset**: output delay (Bluetooth headphones often add 150-300 ms) needs a nudge control.

## Build order
1. ✅ Studio on placeholder timing: every sketch as a layer, sliders, palettes, preview sounds, copy score
2. ✅ Song sources: Spotify in the tab or following the app, or a local file
3. ✅ Tap to fit the grid (T), nudge it ([ ]); the score stretches to the song's length
4. ✅ Listen for the tempo through BlackHole; one tap sets the 1
5. Set the real grid, then move the sections to the song's real bars
6. Real tracks: tap the claps, bongos and key holds, or adjust the patterns
7. Polish: full-screen playback, palettes, the elements not placed yet
