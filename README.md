# sound-square

A square that lives with a song. Paper sketches of what I see while listening become shapes, motion and color that play in sync with the track.

Companion to [audiovisual-codebook-ideas](https://github.com/mishkin101/audiovisual-codebook-ideas), the listening journal the sketches come from. First song: *I Haven't Recovered From Last Night With You* by Divorce from New York.

> Work in progress. Timing is a placeholder until the song is tapped in. Spotify sync comes later.

## Run it

**1. Start the local server** from the project folder

```bash
cd sound-square && python3 -m http.server 8766
```

**2. Open the studio** at [http://127.0.0.1:8766](http://127.0.0.1:8766) in Chrome.

## Play it with the song

### With Spotify (needs Premium)

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), sign in and create an app:
   - **Redirect URI:** `http://127.0.0.1:8766/`
   - **APIs used:** Web API and Web Playback SDK
2. Copy the app's **Client ID** from its settings.
3. In the studio, opened at `127.0.0.1` (Spotify doesn't accept `localhost`), choose **Song → Spotify**. Paste the Client ID, press **Connect** and approve on Spotify's page.
4. Paste the song link. In Spotify, it's under **Share → Copy Song Link**.
5. Under **Play through**, choose **This tab** for the tightest sync, or **Spotify app** to follow the desktop app. Then press **Play**.

The Client ID and sign-in stay in this browser; nothing about them is saved in the repo. Keep the Spotify-synced version private: Spotify's Developer Policy restricts pairing recordings with visuals.

### With a file

**Song → File → Choose audio file** (mp3, m4a, wav and so on).

### Let the studio find the tempo

Spotify doesn't share tempo or audio with apps, so the studio listens to what the Mac plays instead. It does that through [BlackHole](https://existential.audio/blackhole/), a free audio driver that sends the Mac's output back in as an input. Setup is once:

1. **Install BlackHole.** It asks for your Mac password:

   ```bash
   brew install --cask blackhole-2ch
   ```

2. **Hear it and send it to BlackHole at the same time.** Open **Audio MIDI Setup** (Applications → Utilities). Click **+** at the bottom left, then **Create Multi-Output Device**. Tick your speakers or headphones and **BlackHole 2ch**. Set **Primary Device** to the speakers or headphones, and tick **Drift Correction** for BlackHole 2ch. If BlackHole 2ch isn't listed, restart the Mac.
3. **Use it as the Mac's output:** System Settings → Sound → Output → **Multi-Output Device**. The volume keys don't work with it, so set the level in Audio MIDI Setup. Switch back to your speakers when you're done.

Then:

1. Play a song and press **Listen** once. Chrome asks to use your microphone; that's how browsers reach any audio input, including BlackHole. Allow it, and the studio picks **BlackHole 2ch**.
2. From then on it's automatic. For a song without a grid, the studio listens by itself. It finds the tempo (a whole number when the music sits on one) and the 1 of the bar: claps land on 2 and 4, and the music changes most on the 1. After about 50 seconds it locks and saves the grid for that song in this browser, and uses it every time the song plays.

If the 1 ever comes out wrong, tap **T** once on a real 1. **[** and **]** move the grid 10 ms earlier or later.

### Or tap the grid by hand

Without BlackHole, tap **T** on the 1 of every bar for at least 8 bars, and the grid follows your taps. If they land within about ±20 ms of the grid, the tempo is steady.

## Studio controls

| Key | Does |
|---|---|
| **Space** | play / pause |
| **← →** | previous / next bar |
| **1–6** | jump to a section |
| **T** | tap a 1: sets where the bars start (by hand, tap every bar to fit the tempo too) |
| **M** | mark a moment: a named thing you hear. Quick presses make one moment with several hits; held down, M marks a hold (a span, like the bongo section) |
| **[ ]** | move the grid 10 ms earlier / later |
| **Esc** | undo the last round of taps |
| **E** | edit mode: place the picked layer's shapes on the square |
| **D / X / R** | in edit mode: duplicate the shape (a unique copy — own spots, keys, timing) · mirror the selected spot · turn it 15° (Shift turns back) |
| **K** | a keyframe at the playhead: the selected spot's place, eased between keys (diamonds on the picked clip). Parked on a key, dragging the shape writes into it |
| **⌘Z / ⇧⌘Z** | undo / redo square edits: spots, clips, layers, moments, pulses |
| **Delete** | in edit mode, remove the selected spot |
| **S** | preview sounds: a click on every beat, blips for claps and bongos, a tone while keys are held |
| **H** | hide everything but the square |
| **F** | full screen |

### Shapes

The **Shapes** tab (top left) is where shapes are made and edited. Each one is an SVG in `shapes/`.

- **Library** (left): every shape in `shapes/`. **New** starts a blank one; **Import SVG** brings in a drawing from Figma, Illustrator, Inkscape and so on. A • means unsaved changes.
- **Toolbar** (on the canvas): Select, Points, Pencil, **Shape ▾** (rectangle, ellipse, line, arrow, polygon, star), Eraser, Photo, Undo, Redo. The right panel shows only the options of the tool in use, or of the selection once something is selected.
- **Canvas** (middle): the shape on the ground color. The dashed circle is the size of one spot on the square. Pinch or ⌘-scroll to zoom toward the pointer; scroll, middle-drag or hold **H** and drag to pan. ⌘+ and ⌘− zoom, ⌘0 (or the % button, bottom right) fits the shape again.
- **Select** (V): click a line (Shift adds more) or drag a box around lines. Drag to move them, a corner to scale, the round knob above to turn. Hold Shift to keep it level, in proportion, or in 15° steps. Arrow keys nudge (Shift: further), ⌘D duplicates, Delete removes, ⌘A selects everything. With lines selected, the Selection panel sets their **Fill**, **Line** color and **Line weight** (the slashed swatch removes a fill or a line), and which part they're in. For pencil lines it also sets **pressure** (how much the line swells and thins; 0 is even) and **pointed ends**. **Smooth** irons out wobbles (click again for more) without adding points.
- **Points** (A), like a pen tool: click a line to show its points. Drag a point (Shift-click or drag a box for several), or a handle to bend the curve. A smooth point keeps both handles in line; hold Alt to bend one side only. Double-click a point to switch it between smooth and corner; double-click the line to add a point; Delete removes points. **Fewer points** smooths a hand-drawn line down to fewer points, so it's easier to reshape.
- **Pencil** (N) draws lines that thin and swell with pen pressure (or speed, with a mouse). With a fill set, the area a line encloses fills in (a straight edge closes it if the ends don't meet). **Eraser** (E) removes whole lines. ⌘Z undoes, ⇧⌘Z redoes.
- **Redraw** (on for the pencil): start a pencil line on an existing line (it turns blue) and end it on the same line, and that stretch is replaced by what you drew. Works on shapes and imported lines too. Start at either end of a pencil line and it carries on from there. Hold **Alt** (or turn Redraw off) to draw a separate line.
- **Photo** (P): put a photo of a paper sketch under the drawing (**Choose photo**, or drop one on the canvas). Drag it to move it (arrows nudge), and set its **size**, **turn** (to straighten an angled photo) and **strength**. Only what's inside the box counts, so size and place the photo until the sketch you want fills the box. Then trace over it with the pencil, or **auto-trace**:
  - **Trace lines**: a pencil line down the middle of each mark, as wide as the mark, thinner where it was lighter. Best for line drawings.
  - **Trace shapes**: each mark's outline as a filled shape. Best for shading, hatching and blobs.
  - **Sensitivity** sets how faint a mark can be and still count; **ignore specks** drops paper grain. What will be traced shows in blue while the Photo tool is on.
  - The result goes into a new part, `trace`, selected, so you can move and size it right away and hide it to compare. The photo isn't saved in the shape; the studio keeps the last one in the browser for the next shape.
- **Shapes**: **Rect** (R), **Ellipse** (O), **Line** (L), **Arrow** (Shift L), **Polygon**, **Star**. Drag from corner to corner; Shift keeps it even (a square, a circle, a 45° line), Alt draws from the middle out, a click makes one at a default size. They come out as ordinary paths, so Points and Select work on them.
- **Pencil and shape options** (in the panel while that tool is in use): the fill, line color and line weight of what it draws (the slashed swatch is none), the pencil's pressure, pointed ends and Redraw, a rectangle's corner radius, a polygon's sides or a star's points. Lines follow the palette, so they change color with the sections.
- **Parts**: named groups, top to bottom like layers. Drag a part up or down the list to put it over or under the others. The eye hides a part (it's hidden on the square too, until you show it again). New lines go into the marked part. Shift-click parts to select all their lines (with Select, a plain click does too), then move, recolor or restyle them together. Double-click a name to rename it.
- **Imported colors** (folded away under the parts): link each color of an imported drawing to a palette color, or keep it as drawn.
- **Save** writes `shapes/<name>.svg`. The first time, Chrome asks which folder to save in: pick the sound-square folder. **Add to square** puts the shape on the square in a new layer and switches to Edit mode to place it. **Delete** asks first, then moves the file to `shapes/deleted/` (move it back into `shapes/` to get the shape back); if the shape is on the square, its layer goes too, so **Copy score.js** afterwards to keep it that way.

**Motion** (the switch at the top of the right panel) sets how the shape moves with the song, and the canvas plays it: with the song while it plays, or by itself from the playhead when it's paused. **+ Motion** adds one; each card picks what it does, what moves (the whole shape or one part), what it follows, and its amounts:

| Motion | Does | Follows |
|---|---|---|
| pop in · fade in · draw in | appears when its layer comes in; spots take turns, in their opening order | when it comes in |
| pulse · jump | swells or hops, then settles | every beat or bar, claps, bongos (pulse also: held keys, energy) |
| blink | squashes shut for a moment | now and then, or on beats, bars, claps, bongos |
| drift · sway · spin | wanders, swings, turns | all the time, or as much as the energy |
| boil | shakes a little, like hand-drawn animation | all the time |

Motions belong to the shape, so they run wherever it's on the square, each spot a little differently. They're saved in the shape's SVG.

Saved shapes are plain SVGs any app can open. Pen lines reopen as pen lines; if a shape is changed in another app, the studio reads it as that app saved it.

### Place shapes on the square

Press **E** (or **Edit**). The open layer's spots show with outlines and numbers, wherever the song is.

- **Drag** inside a spot to move it, and drag its edge (the small square) to resize it.
- **Double-click** empty space to add one. Select one and press **Delete** to remove it.
- **Click the numbers** in the order the spots should open: the first one clicked becomes 1, the next 2, and so on.

The places go into the layer as `spots` (`[x, y, size]`) when you **Copy score.js**. A layer's box has a menu to swap its shape.

**The timeline is the editor.** A **layer** is a named row that holds **shapes** (clips), drawn bottom to top — the "split" scene is one layer holding its divider, circles and tones. Drag a clip's body to move it, an end to trim it. Ends snap to bars and to moment markers — landing on a marker attaches that end to the moment (a ▾ shows it), so it keeps following the moment wherever it's dragged or re-marked. Click a clip (on the timeline or in the Layers list) to pick it; only the picked clip's controls show in the panel. **+ shape…** adds a library shape into the picked layer at the playhead, **+ Layer** makes a new row, Delete removes the picked clip, × removes a layer, the eye hides one, dragging rows restacks them, double-click renames. Pinch or ⌘-scroll over the timeline zooms toward the pointer, scroll pans, double-click fits the song again, and it follows the playhead while playing.

**Moments** are how things land on the real song instead of bar numbers. Play the song and press **M** on what you hear; quick presses group into one moment (the two fast taps), a pause starts the next, and holding M down marks a hold — a span, like the bongo section, that from/until can wrap with "during". Each moment's card holds its name and a note about what you heard; its eye keeps the marker off the timeline (good for moments that only trigger things), and "Hide all markers" clears the ruler entirely — hidden moments still anchor and trigger. Drag visible markers on the timeline to adjust. The Moments, Layers and Colors sections fold away as they grow. Then, in a layer's box, **from** and **until** can name a moment instead of a bar; a shape layer's **spots** can show *all at once*, *take turns* (one appears per hit of **moves on**) or *one at a time* (a single copy moves between spots on each hit, switching by jumping, blinking across or sliding, and **then** staying put or continuing every beat or bar). **+ Pulse** under Colors makes a palette color breathe toward another between two moments — the opening's salmon ground fading to white every four beats until the bongos come in.

Click or drag the timeline to move through the song. The picked layer's sliders change it live, and the color swatches edit the palettes. **Copy score.js** copies the result, so you can paste it over `score.js` to keep it.

## Files

| File | What it holds |
|---|---|
| `score.js` | The song plan: timing, what happens in the music, palettes, layers. The file to edit. |
| `assets/elements.js` | The coded shapes from the sketches and their sliders. |
| `assets/shapes.js` | Reads shapes (SVG) and draws them on the square. |
| `assets/editor.js` | The Shapes tab. |
| `assets/tools.js` | Its Select, Points and shape tools, and redrawing with the pencil. |
| `assets/trace.js` | The Photo tool: a sketch under the drawing, and auto-trace. |
| `assets/motions.js` | Motions: how a shape moves with the song. |
| `assets/shapedoc.js` | A shape as the Shapes tab edits it: parts, pen lines and paths, saving. |
| `assets/geom.js` | Lines as editable curves: reading SVG paths, fitting pen lines. |
| `shapes/` | The shapes, one SVG each. `eye.svg` is a rough stand-in for now. |
| `assets/engine.js` | Time, events, transitions and color blending. |
| `assets/studio.js` | The studio page: square, timeline, side panel, tapping. |
| `assets/sources.js` | Where the song position comes from: the stand-in clock or a file. |
| `assets/spotify.js` | Spotify sign-in and its two sources: a player in the tab, or following the app. |
| `assets/listen.js` | Listening through an audio input (BlackHole) and keeping the grid on the beat. |
| `assets/tempo.js` | Finding the tempo and the beat in what was heard. |
| `assets/sound.js` | Preview sounds. |
| `docs/concept.md` | The thinking behind it, and how each sketch became a layer. |
| `docs/sketches/` | The sketchbook page. |
