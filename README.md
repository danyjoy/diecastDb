# diecastDb: Hot Wheels catalog browser

A static web app, also used as a Telegram Mini App, for browsing Hot Wheels
castings: photos, search, series filters, Treasure Hunt / Chase highlights,
and a camera scanner that identifies a car from its blister card.

Live site (GitHub Pages): **https://danyjoy.github.io/diecastDb/**

## What it does

- **Browse** three collections: Mainline (1968–2027), Premium (2012–2027) and
  Silver Series (2009, 2012–2027), about 17,800 cars in total. Pick a
  collection and a year, then search or filter by series, Treasure Hunt,
  Super Treasure Hunt, Chase or Soft Chase.
- **Car details**: every spec in the catalog, a photo gallery with a
  full-screen pinch-zoom viewer, image download and copy-name.
- **Scan a card**: point the phone at a blister card. The app reads the car
  name on the device, matches it against every year and collection, and ranks
  the colour variants by the car's colour in the photo. Nothing is uploaded.
- **Weekly data refresh**: a GitHub Action re-scrapes the current and next
  year every Monday and commits any changes.

## Documentation

| Topic | File |
|---|---|
| Browsing features and Telegram integration | [docs/features.md](docs/features.md) |
| Card scanner: how to use it and how it works | [docs/card-scanner.md](docs/card-scanner.md) |
| Data files, manifest and car record format | [docs/data.md](docs/data.md) |
| Weekly catalog updates (GitHub Action, scraper) | [docs/catalog-updates.md](docs/catalog-updates.md) |
| Running locally, testing on a phone, code layout | [docs/development.md](docs/development.md) |
| OCR model files and their sources | [models/README.md](models/README.md) |

## Repository layout

```
index.html                  the whole app (vanilla HTML/CSS/JS, no build step)
ocr.js                      on-device text reader used by the scanner
models/                     OCR models (ONNX) + character list
data/
  index.json                manifest: collections and the years each has
  <year>/<collection>.json  one catalog file per collection per year
  scan-index.json           compact list of every car, used by the scanner
scripts/
  update-catalog.js         weekly scraper (run by the GitHub Action)
  build-scan-index.js       rebuilds data/scan-index.json
.github/workflows/
  update-catalog.yml        weekly schedule for the scraper
logo.svg, logo-header.svg, og-image.png, wheel-loader.json   assets
.nojekyll                   serve files as-is on GitHub Pages
```

## Quick start

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

There is no build step: pushing to `main` deploys to GitHub Pages. See
[docs/development.md](docs/development.md) for testing the scanner on a phone.

## Data source

Catalog data is the publicly listed Hot Wheels information from
[findmyhw.com](https://findmyhw.com); images are hotlinked from there.

## Trademarks & disclaimer

This is an unofficial, non-commercial fan-made tool for personally browsing and
tracking a die-cast collection. It is **not affiliated with, endorsed by, or
sponsored by** Mattel, Inc. or findmyhw.com.

"Hot Wheels", the Hot Wheels logo, "Treasure Hunt", "Super Treasure Hunt",
"Boulevard", "Car Culture", "Silver Series", and all related names, logos,
casting names, and marks are trademarks and/or copyrights of **Mattel, Inc.**
or their respective owners. The logo and all product images, names, and catalog
data belong to their respective companies and rights holders and are used here
for identification and reference purposes only. All rights remain with their
respective owners.

If you are a rights holder and would like something removed, please open an
issue on the repository.
