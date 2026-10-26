# diecastDb — Hot Wheels catalog browser

A static Telegram Mini App (Web App) that browses scraped Hot Wheels catalogs:
photos, search, series filters and Treasure Hunt filters. Pick an **assortment**
(Mainline, Boulevard, …) from the menu and a **year** from the header dropdown;
tap a car for a detail card with every spec and image.

Served over HTTPS by **GitHub Pages**:

```
https://danyjoy.github.io/diecastDb/
```

## Contents

```
index.html          # the Mini App (vanilla HTML/CSS/JS, no build step)
.nojekyll           # serve files as-is (no Jekyll)
data/
  index.json        # manifest: assortments, the years each has, and the default
  <year>/<assortment>.json   # one catalog file per assortment, per year
```

Example:

```
data/2026/mainline.json
data/2026/boulevard.json
data/2012/boulevard.json
```

The app reads `data/index.json` first to learn what assortments exist and which
years each one has, then loads `data/<year>/<assortment>.json` for the current
selection. It opens on the default assortment and the **current calendar year**
(or that assortment's newest year if it has no current-year data).

## Manifest (`data/index.json`)

```json
{
  "default": { "assortment": "mainline" },
  "file_pattern": "{year}/{assortment}.json",
  "assortments": [
    { "key": "mainline",  "label": "Mainline",  "years": ["2026"] },
    { "key": "boulevard", "label": "Boulevard", "years": ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2013", "2012"] }
  ]
}
```

- `default.assortment` — which assortment opens first.
- `assortments[].key` — internal id; also the file name (`<key>.json`).
- `assortments[].label` — the menu/header text.
- `assortments[].years` — the years this assortment has files for (any order;
  the app sorts newest-first). The current year is used as the default when
  present.
- `file_pattern` — optional; defaults to `{year}/{assortment}.json`.

## Adding a new collection (year or assortment)

1. Scrape it in the tracker project (writes `hotwheelsDB/<year>/<assortment>.json`).
2. Copy the file(s) into `data/<year>/<assortment>.json` here.
3. Update `data/index.json`: add the assortment (or add the new year to an
   existing assortment's `years`).
4. Commit and push:

```bash
git add data && git commit -m "Add boulevard catalog" && git push
```

GitHub Pages redeploys automatically within a minute or two. No code change
needed — the assortment menu and year dropdown build themselves from the
manifest.

## Data source

Catalog data is the publicly listed Hot Wheels info from
[findmyhw.com](https://findmyhw.com); images are hotlinked from there.
