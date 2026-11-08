# web - the menu page

The web page the TVs show. One page, three screens: each Pi opens it with
`?screen=1`, `?screen=2` or `?screen=3` and the page works out the rest.

## What it does

- Shows **breakfast** 6:30 am - 10:00 am, **lunch** 10:00 am - 2:30 pm,
  Monday to Friday. Any other time, and any date listed as a holiday, it shows
  the Closed picture. (All times and days come from the Google Sheet.)
- From 2:00 pm to 2:30 pm it adds a **"grill is closed" bar** across the bottom
  of the lunch menu.
- Each screen runs a loop: the menu, then its extra slide(s).

  | Screen | Menu (30 s) | Extra slide(s) |
  |---|---|---|
  | 1 | Breakfast 1 / Lunch 1 | Condiments, 5 s |
  | 2 | Breakfast 2 / Lunch 2 | Welcome, 5 s |
  | 3 | Breakfast 3 / Lunch 3 | The video, **its full length**; then on **Wed, Thu, Fri at lunch** the day's Special, 5 s (menu is 25 s on those days) |

  The video is never cut off: its slot is however long the file is (the current
  one is 6 s, so Screen 3's loop is 36 s; with the Special, 25 + 6 + 5).
  Screens 1 and 2 loop every 35 s, in step with each other. Screen 3's loop is a
  little longer, so it drifts relative to the other two. That does not matter,
  since each TV is a separate picture.
- **Seasons.** On dates you choose, the page can swap the video (for example a
  Christmas one for December) and draw a **holiday overlay** over every slide.
  Set up in the Sheet's `seasons` tab (see `sheet/README.md`).
- Prices, descriptions, section titles, notes, Specials, seasons and times come
  from the Google Sheet and refresh every 5 minutes. Basket and combo prices are
  **calculated** from the sandwich price.

## Preview before anything goes live

Double-click **`preview.bat`** (Windows) or **`preview.command`** (Mac). It opens
`preview.html` in your browser: a wall of small pictures showing every screen at
breakfast, at lunch, and at lunch with the grill-closed bar, plus the extra
slides, the three Specials and the Closed picture. Click any picture to open it
full size. At the bottom are links that run a whole screen in real time at a
pretend Wednesday time.

Choose **where the prices come from**:

| Choice | Shows | Use it to |
|---|---|---|
| My local files | The CSVs in `web/data/` | Try a change you made in `sheet/*.csv` (then `python check_sheet.py --sync`) |
| The Sheet right now (draft) | The Google Sheet as it is this second, unpublished edits included | Check your edits **before** you publish them to the TVs |
| What the TVs show (published) | The published Sheet | See exactly what the TVs are showing |

If the chosen source cannot be read, the picture says so in red. It never
quietly falls back to different prices, so a preview is always telling the truth.
"Draft" and "published" need the Sheet set up first (`sheet/README.md`).

The **Season** menu forces a season (for example *Christmas* in November, or
*Overlay demo*) so you can see it without waiting for the date.

Close the black preview window when you are done. (Mac: the first time, right-click
`preview.command` > Open, and if it will not run, `chmod +x preview.command`.)

## Why it is built this way

- **A web page, not pictures.** The old menus were 3840x2160 images, so every
  price change meant editing a picture. Now the text is real text.
- **Drawn at 3840x2160 and scaled.** The page is laid out on a 4K canvas whose
  measurements were taken from the old PNGs, then shrunk to fit the TV. That is
  why it lines up with the old menus (within about 2-5 pixels on a 2160-pixel
  screen) and why it looks the same on a 1080p or 4K TV.
- **No frameworks, no build step.** Plain HTML, CSS and JavaScript. Nothing to
  install, nothing that can go out of date; a person can read every file.
- **Works without internet.** `sw.js` stores the whole page, the pictures, the
  video and the last prices on the Pi. Prices from the Sheet are also saved in
  the browser each time they load. Order of preference for prices:
  Google Sheet -> last good copy saved on the Pi -> the copy in `data/`.
  A broken or empty Sheet is ignored; it never blanks the screen. Seasonal
  videos and overlays are fetched ahead of time, so December's video is already
  on the Pi before December.
- **Shop time, not Pi time.** The page uses the America/Chicago clock whatever
  the Pi's timezone says.
- **Self-refreshing.** At 3 am each night the page reloads itself to pick up any
  new version of the page.

## Files

| File | What it is |
|---|---|
| `index.html` | The empty stage the page draws into |
| `menu.css` | All layout and sizes (the measured values) |
| `app.js` | Data loading, schedule, rotation, seasons, drawing |
| `config.js` | The few settings that are not in the Sheet: timezone, Sheet links, Sheet ID, which extras each screen shows |
| `sw.js` | Offline cache. Raise the number in `CACHE` when you change a file in `assets/` |
| `preview.html`, `preview.bat`, `preview.command` | The preview page and its double-click launchers |
| `data/*.csv` | Bundled copy of the Sheet (kept in step by `sheet/check_sheet.py --sync`) |
| `assets/` | Closed, Condiments, Welcome, Facebook laptop picture, Special photos |
| `assets/videos/` | The Pepsi videos (swap by file name in the Sheet) |
| `assets/overlays/` | Holiday overlays (transparent 3840x2160 PNGs). `sample-candy-border.png` is a placeholder |

### Adding a video or an overlay

1. Put the file in `assets/videos/` or `assets/overlays/` (no spaces in the name).
2. Type its path (like `videos/pepsi-snowglobe.mp4`) in the Sheet: in
   `settings > video` to change the everyday video, or in a `seasons` row.
3. Run `python sheet/check_sheet.py --sync` (it checks the file exists), and
   raise `CACHE` in `sw.js` so every Pi fetches it. Then upload `web/`.

Videos: use H.264 (`.mp4`), 1920x1080 or smaller, a few MB. Overlays: a
transparent PNG the size of the screen (3840x2160). The menus fill almost the
whole screen, so keep overlay art to the thin margins (about 40 px) or the
corners, or it will cover text. The sample border shows the idea.

## Run it on this PC

Use `preview.bat`. Or by hand:

```
cd "Digital Menus/web"
python -m http.server 8077
```

then open `http://127.0.0.1:8077/index.html?screen=1`. (Opening the file by
double-click does not work: browsers block a page from reading local data files.)

Options added to the address (nothing to do with normal running):

| Option | Effect |
|---|---|
| `&now=2026-11-11T11:00` | Pretend it is this shop time (Wednesday 11 am) |
| `&freeze=1` | With `now`, stop the pretend clock moving |
| `&show=L1` | Hold one slide: `B1`..`L3`, `closed`, `extra:0`, `special:Wed` |
| `&grill=1` | Force the grill-closed bar |
| `&data=local` / `draft` / `live` | Use exactly one data source (see Preview) |
| `&season=Christmas` | Force a season |
| `&still=1` | Show a video as one still frame (used by the preview thumbnails) |
| `&nosw=1` | Do not register the offline cache |

## Dependencies

A modern Chromium-based browser (the Pi's Chromium, Edge, Chrome). The page is
drawn in Arial; the Pi substitutes Liberation Sans, which has the same character
widths, so lines break in the same places.

## What was tested (on this Windows PC, Edge)

- Every menu page compared with the original PNG row by row: text rows within
  about 2-4 px of 2160; lines wrap in the same places. (Not pixel-for-pixel: a
  different text renderer draws letters a hair differently.)
- Wednesday, Thursday and Friday Specials compared with the old slides.
- 36 schedule, rotation and season checks with a frozen clock: breakfast, lunch
  and closed boundaries; weekends; the three screens; the video holding its
  full length; the Special days; the grill bar; the Christmas video from Dec 1
  to Dec 31 and back to normal on Jan 1; the overlay; forced and unknown seasons.
- Offline: loaded online, stopped the web server, reloaded - the menu still drew
  from the cache (service worker active, files stored including the video).
- Price handling: an edited price appears; basket/combo recalculate; if the
  Sheet disappears the edited price is kept; a fresh Pi with no internet shows
  the bundled prices; an empty or garbage Sheet does not break the screen;
  `data=local` ignores the Sheet, `data=live` reads it, `data=draft` with no
  Sheet ID shows a clear message.
- The preview page draws every tile with no script errors.
- The video plays in the page (1920x1080, H.264).

## Not tested

- On a real Raspberry Pi (speed at 4K, smooth video, Liberation Sans).
- Against a real published Google Sheet. The stand-in behaves like the
  published links; **the "draft" option uses a different Google address (the
  Sheet's live view) that I could not try without a real Sheet**, so treat it
  as untested until you have used it once.
- The 3 am self-refresh.

## Deliberately out of scope

- Editing prices on the TV itself (edit the Sheet).
- Showing today's date/time on the TVs.
- Photos in the Sheet: Special photos are files in `assets/specials/`; to use a
  new one, add the file and type its name in the Sheet's Photo column.
- Animated overlays with transparency (the Pi's browser cannot play transparent
  video reliably). A still PNG overlay works; an animated PNG may too.
