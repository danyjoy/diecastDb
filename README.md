# diecastDb — Hot Wheels catalog browser

A static Telegram Mini App (Web App) that browses a scraped Hot Wheels mainline
catalog: photos, search, series filters and a Treasure Hunt filter. Tap a car
for a detail card with every spec and image.

Served over HTTPS by **GitHub Pages**:

```
https://danyjoy.github.io/diecastDb/
```

## Contents

```
index.html          # the Mini App (vanilla HTML/CSS/JS, no build step)
data/mainline.json  # the catalog snapshot the app reads
.nojekyll           # tell Pages to serve files as-is (no Jekyll)
```

## Updating the catalog

The data is a snapshot. To refresh it, re-run the scraper in the tracker project
and copy its output here, then commit and push:

```bash
cp /path/to/pi-tracker/hotwheelsDB/mainlines/2026/mainline.json data/mainline.json
git add data/mainline.json && git commit -m "Update catalog" && git push
```

GitHub Pages redeploys automatically within a minute or two.

## Data source

Catalog data is the publicly listed Hot Wheels mainline info from
[findmyhw.com](https://findmyhw.com); images are hotlinked from there.
