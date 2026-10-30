# Card scanner

The camera button in the search bar opens a scanner. It reads the car name
printed on a blister card, finds that car in every year and collection, and
puts the colour variant that matches the car in the photo first. Everything
runs on the device; no photo is uploaded.

## Using it

1. Tap the camera button next to the search box.
2. Fit the **whole card** inside the white frame, with the car name in the
   blue **Car name** zone at the bottom.
3. Press the shutter. Or tap **Photo** to take or pick a picture instead.
4. Tap a result to open that car. The app loads its collection and year if
   needed.
5. On the website, each result also has **+** (add to your collection, then
   **− n +** for the number of copies) and a **bookmark** (wishlist). They
   save the car without leaving the scanner (signing in with Google first if needed). See
   [my-collection.md](my-collection.md). The Telegram Mini App doesn't show
   them.

The results screen shows:

- **Text read from the card**, editable. The list updates as you type, so you
  can fix a misread or type the name by hand.
- **Car colour**: the detected colour, as a swatch and a name (Black, Red, …).
- **Matches**: up to 20, with photo, year, collection, series, collector number
  and body colour. Tags show Super TH / Treasure Hunt / Chase, an SKU match,
  and **Colour match** when a car's catalog colour is the detected colour.

**First use** downloads the text reader (about 27 MB). A progress bar shows the
download, and the shutter and Photo buttons stay disabled until it finishes.
After that it's cached by the browser. While a card is being read, the
captured photo stays on screen with a progress bar.

**Tips:** get close enough that the name fills most of the zone's width; tilt
the card slightly to avoid glare on the plastic bubble; use **Photo** if the
live camera struggles.

## Requirements

- The live camera needs HTTPS (GitHub Pages provides it). Over plain HTTP, or
  when the camera is blocked, the scanner shows **Photo** only.
- A browser with WebAssembly. Tested in desktop Chrome and WebKit (the engine
  behind iPhone browsers).

## How it works

### 1. Capture

- **Live camera:** the app copies the area inside the white frame from the
  video. It reads the **name zone** first: the bottom of the card, from 60%
  of the frame height down, enlarged to 2000 px wide. Only if that gives no
  confident match does it read the **whole card**.
- **Photo:** the picture isn't cropped to the card, so the app reads
  overlapping horizontal strips (a third of the height each), bottom first,
  then the whole picture.

Each image is converted to grayscale with its contrast stretched before
reading. Reading stops as soon as the text gives a match scoring 80% or more.

### 2. Reading the text (`ocr.js`)

A small [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) pipeline on
[ONNX Runtime Web](https://onnxruntime.ai/):

1. **Detection** (PP-OCRv3 English, 2.4 MB) finds the text lines.
2. Each line is turned level using its angle, so slightly tilted text reads
   correctly.
3. **Recognition** (PP-OCRv6 small, 21 MB) reads each line. Its output is
   limited to Latin characters so it never returns Chinese look-alikes.

Details:

- Lines the model is less than 65% sure of are dropped, unless nothing else
  was read.
- Lines made only of packaging text are removed: **MATTEL** (including partial
  reads like "TTEL"), "Hot Wheels", "3+", and the choking-hazard warning.
- Inference runs in a background worker (ONNX Runtime's proxy mode, single
  thread), so the page keeps updating while a card is read.

See [../models/README.md](../models/README.md) for the model sources and why
this combination was chosen.

### 3. Matching the name

The text is compared with every car in `data/scan-index.json` (all years and
collections, see [data.md](data.md#scan-index-datascan-indexjson)):

- Each word of a car's name is looked for in the text: exact, a close typo,
  common OCR swaps (O/0, I/1, S/5), or words glued together
  ("FERRARIF40" → FERRARI F40). A number that ends a model code also counts
  ("34" for BNR34).
- Longer words count more. Card boilerplate words count very little, so they
  can't make a match alone.
- At least one real word of the name has to be clearly read.
- Bonuses: the car's **SKU** found on the card (+0.6), and its **collector
  number** such as "179/250" (+0.1).

### 4. Ranking by colour

- The app takes the blister area above the name zone, groups its colours, and
  ignores colours that match the card next to the car, glare, and dark
  tyres/windows.
- The main colour is named as one of 11 families: Black, White, Gray/Silver,
  Red, Orange, Yellow, Green, Blue, Purple, Pink, Brown.
- Each match's catalog colour is reduced to the same families by its colour
  word: "Spectraflame Black" → Black, "Metalflake Bayside Blue" → Blue,
  "Zamac" → Gray/Silver. About 99% of catalog colours map to a family; the rest
  are mostly "Clear" or "Plated".
- Matches in the detected family get a small bonus (+0.12) and the **Colour
  match** tag. The bonus only reorders variants of the same casting; it can't
  beat a clearly better name match.

Colour can be wrong with heavy glare, very colourful card art behind the car,
or multi-colour liveries. The detected colour name is shown so you can tell.

## Files

| File | Role |
|---|---|
| `index.html` | Scanner UI, capture, matching, colour ranking (search for `Card scanner`) |
| `ocr.js` | Text detection + recognition pipeline (`PaddleOCRLite`) |
| `models/` | ONNX models and the character list |
| `data/scan-index.json` | Every car in one compact file, for matching |
| `scripts/build-scan-index.js` | Rebuilds `scan-index.json` |

## Downloads and caching

| What | From | Size |
|---|---|---|
| ONNX Runtime loader `ort.wasm.min.js` (pinned 1.31.1, with SRI hash) | jsDelivr | 54 KB |
| ONNX Runtime WebAssembly binary | jsDelivr | ~3 MB compressed (15 MB unpacked) |
| Detection model | this site | 2.4 MB |
| Recognition model + character list | this site | 21 MB |
| `data/scan-index.json` | this site | ~320 KB compressed |

The progress bar counts unpacked bytes (about 37 MB), so its total is larger
than the actual transfer. Everything is cached by the browser after the first
scan.
