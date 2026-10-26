# diecastDb — Hot Wheels catalog browser

A static Telegram Mini App (Web App) that browses scraped Hot Wheels catalogs:
photos, search, series filters and a Treasure Hunt filter. Pick a **year** and
an **assortment** (Mainline, Premium, …); tap a car for a detail card with every
spec and image.

Served over HTTPS by **GitHub Pages**:

```
https://danyjoy.github.io/diecastDb/
```

## Contents

```
index.html          # the Mini App (vanilla HTML/CSS/JS, no build step)
.nojekyll           # serve files as-is (no Jekyll)
data/
  index.json        # manifest: which years + assortments exist, and the default
  2026/
    mainline.json   # one file per assortment, per year
    premium.json    # (add more as you scrape them)
  2027/
    mainline.json
```

The app reads `data/index.json` first to learn what collections exist, then
loads the selected `data/<year>/<assortment>.json`.

## Adding a new collection (year or assortment)

1. Scrape it in the tracker project (writes `hotwheelsDB/<year>/<assortment>.json`).
2. Copy that file to `data/<year>/<assortment>.json` here.
3. Add it to `data/index.json`:

```json
{
  "default": { "year": "2026", "assortment": "mainline" },
  "years": [
    {
      "year": "2026",
      "assortments": [
        { "key": "mainline", "label": "Mainline", "file": "2026/mainline.json" },
        { "key": "premium",  "label": "Premium",  "file": "2026/premium.json" }
      ]
    }
  ]
}
```

4. Commit and push:

```bash
git add data && git commit -m "Add 2026 premium catalog" && git push
```

GitHub Pages redeploys automatically within a minute or two. No code change
needed — the Year/Type pickers appear automatically once more than one option
exists.

### Manifest fields

- `default` — the year + assortment to open on launch.
- `years[].year` — the year label (string).
- `years[].assortments[]` — `key` (internal id), `label` (button text), `file`
  (path under `data/`).

## Data source

Catalog data is the publicly listed Hot Wheels info from
[findmyhw.com](https://findmyhw.com); images are hotlinked from there.
