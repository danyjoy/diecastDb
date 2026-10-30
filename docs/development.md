# Development

The app is plain HTML, CSS and JavaScript with no build step and no npm
dependencies in the front end. GitHub Pages serves the repository as-is
(`.nojekyll` turns off Jekyll).

## Run locally

From the repository root:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Any static file server works. Opening
`index.html` directly as a file doesn't, because the app fetches its data
with `fetch()`.

## Test on a phone

Browsers only allow the **live camera** on HTTPS pages (and `localhost`).

- **Same Wi-Fi (no live camera):** start the server with
  `python3 -m http.server 8000 --bind 0.0.0.0` and open
  `http://<your-mac-ip>:8000` on the phone. The scanner works with the
  **Photo** button.
- **HTTPS tunnel (full camera):** install `cloudflared`
  (`brew install cloudflared`), then run, with the server still running:

  ```bash
  cloudflared tunnel --url http://localhost:8000
  ```

  Open the printed `https://….trycloudflare.com` URL on the phone. Anyone with
  the link can reach it while the tunnel runs; stop it with Ctrl+C when done.
- **Inside Telegram:** only the deployed site works, since the Mini App points
  at GitHub Pages.

If the phone shows an old version, close the tab and reopen it.

## Deploy

Push to `main`. GitHub Pages republishes within a minute or two. The weekly
data workflow pushes to `main` too (see
[catalog-updates.md](catalog-updates.md)), so pull before pushing.

## Code layout

`index.html` is the whole app:

| Part | What's there |
|---|---|
| `<style>` | Theme variables (`:root`, always dark), header, filters, grid, detail view, zoom viewer, bottom sheets, scanner. |
| Markup | Header and search, grid, detail overlay, zoom viewer, series and year bottom sheets, scanner overlay. |
| `<script>` | One IIFE. In order: Telegram setup, state, image loaders, filtering and rendering (`matches`, `render`), detail view (`showDetail`), zoom viewer, events, collections and boot (`loadCollection`), card scanner. |

`ocr.js` is the scanner's text reader, exposed as `window.PaddleOCRLite`. It
is loaded only when the scanner opens. See [card-scanner.md](card-scanner.md).

`lists.js` is the collection & wishlist sync (Google sign-in + Drive app data
folder), exposed as `window.DiecastLists`. `index.html` loads it at startup
only outside Telegram (`LISTS_ON`). The UI for it (account button and sheet,
+ / − n + and bookmark controls on cards, the detail view, scan results and
My cars rows, Owned / Wanted pills, My cars screen) is the
"My collection & wishlist" part of the script, just before the boot code. See
[my-collection.md](my-collection.md).

### Conventions

- ES5-style JavaScript (`var`, function declarations) to match the existing
  code.
- Escape any catalog or OCR text with `esc()` before putting it in HTML.
- Every overlay pushes a history entry and is closed by the `popstate`
  handler, so the phone's back gesture works. New overlays need the same.
- Layer order (`z-index`): header 10, go-to-top 15, My cars 18, detail 20,
  bottom sheets 30, scanner 35, zoom viewer 40, toast 45.
- Anything that belongs to the collection feature must stay off in Telegram:
  check `LISTS_ON` (or `L`, which is null there).

## External services and libraries

| What | Used for | Notes |
|---|---|---|
| `telegram.org/js/telegram-web-app.js` | Telegram Mini App API | Loaded on every page. |
| `lottie-web` 5.13.0 (jsDelivr) | Wheel loading animation | Pinned, with SRI hash. Falls back to a CSS spinner. |
| `onnxruntime-web` 1.31.1 (jsDelivr) | Scanner text reader | Pinned. The loader script has an SRI hash; the WebAssembly binary comes from the same pinned path. |
| findmyhw.com | Car photos | Hotlinked. |
| wsrv.nl | Image download (JPEG conversion with CORS) | Detail view download button only. |
| Cloudflare Web Analytics | Visit statistics | Cookieless. |
| `accounts.google.com/gsi/client` | Google sign-in (collection feature) | Browser only, loaded by `lists.js`. Google doesn't publish versioned builds, so it has no SRI hash. |
| `www.googleapis.com` (Drive API v3) | Reading/writing the user's lists in their Drive app data folder | Browser only, scope `drive.appdata`. |

There is no Content-Security-Policy. If you add one, it has to allow the hosts
above (scripts, images, `fetch`), WebAssembly (`'wasm-unsafe-eval'`), and the
ONNX Runtime worker that loads from jsDelivr. For sign-in it also needs
`accounts.google.com` in `script-src`, `frame-src` and `connect-src`, and
`www.googleapis.com` in `connect-src`. Test the scanner and sign-in after
adding it.

Google sign-in only works on origins listed in the OAuth client
(`https://danyjoy.github.io`, `http://localhost:8000`). For a tunnel URL, add
it there first (see [my-collection.md](my-collection.md)).

## Updating the OCR models

The model files and their sources are listed in
[../models/README.md](../models/README.md). To try another PaddleOCR model:

1. Put the ONNX file(s) and character list in `models/`.
2. Update `OCR_MODELS` and `OCR_FILES` (sizes are used for the progress bar)
   near the top of the card scanner code in `index.html`.
3. If the detector comes from a different model family, pass its
   `PostProcess` values from `inference.yml` as `det: { thresh, boxThresh,
   unclip }` to `PaddleOCRLite.load`.
