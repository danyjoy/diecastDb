# Data

All catalog data is static JSON under `data/`, served as-is by GitHub Pages
(about 19 MB in total).

```
data/
  index.json                  manifest
  <year>/<collection>.json    e.g. data/2026/mainline.json
  scan-index.json             compact list of every car, for the scanner
```

| Collection (`key`) | Years | Cars |
|---|---|---|
| `mainline` | 1968–2027 | 14,474 |
| `premium` | 2012–2027 | 1,954 |
| `silver-series` | 2009, 2012–2027 | 1,404 |

## Manifest (`data/index.json`)

The app reads this first, then loads one collection-year file at a time.

```json
{
  "updated_at": "2026-10-26",
  "default": { "assortment": "mainline" },
  "file_pattern": "{year}/{assortment}.json",
  "assortments": [
    { "key": "mainline", "label": "Mainline", "group_by": "series_name",
      "years": ["2027", "2026", "…", "1968"] },
    { "key": "premium", "label": "Premium",
      "group_by": "assortment", "group_label": "Assortment",
      "subgroup_by": "series_name", "subgroup_label": "Series",
      "years": ["2027", "…", "2012"] },
    { "key": "silver-series", "label": "Silver Series",
      "group_by": "assortment", "group_label": "Assortment",
      "subgroup_by": "series_name", "subgroup_label": "Series",
      "soft_chase": true,
      "years": ["2027", "…", "2009"] }
  ]
}
```

| Field | Meaning |
|---|---|
| `default.assortment` | Collection the app opens on. |
| `file_pattern` | Optional; path of a collection file. Defaults to `{year}/{assortment}.json`. |
| `assortments[].key` | Internal id, also the file name. |
| `assortments[].label` | Menu and header text. |
| `assortments[].group_by` | Car field for the first filter level. Defaults to `series_name`. |
| `assortments[].group_label` | Label of that filter pill. Defaults to "Series". |
| `assortments[].subgroup_by` | Optional second filter level (series inside an assortment). |
| `assortments[].subgroup_label` | Label of the second-level pill. |
| `assortments[].soft_chase` | `true` to compute and show Soft Chase (Silver Series). |
| `assortments[].years` | Years with a file. Any order; the app sorts newest first. |

The collection menu and year list are built from the manifest, so adding data
needs no code change.

> Boulevard is a sub-line of Premium, not its own collection. It appears as an
> Assortment option inside Premium.

## Collection files (`data/<year>/<collection>.json`)

```json
{
  "source": "findmyhw.com",
  "collection": "mainline",
  "release_year": 2025,
  "scraped_at": "2026-10-27T06:00:12.000Z",
  "count": 440,
  "cars": [ … ]
}
```

Some older hand-copied files also have a `segment` key at the top. The app
only uses `cars`.

### Car record

```json
{
  "id": "JBB06_1",
  "title": "'15 LAND ROVER DEFENDER DOUBLE CAB",
  "sku": "JBB06", "sku_variation": "1",
  "release_year": 2025,
  "series_name": "HW Dirt", "assortment": "Mainline", "segment": "Mainline",
  "rarity": null,
  "mainline_index": "179", "series_index": "10/10",
  "scale": "1/64",
  "casting_designer": "", "art_director": "Mike McClone",
  "country_of_origin": "Malaysia",
  "body_color": "Dark Red", "base_material": "Plastic", "base_color": "Black",
  "wheel_types": "BLOR Bead-Lock Off-Road",
  "oem": "Land Rover", "interior_colors": "Black", "window_colors": null,
  "casting_number": "FJV45",
  "created_at": "2026-10-13 00:01:16", "updated_at": null,
  "images": ["https://findmyhw.com/media/images/JBB06_1/JBB06_1_1.webp", "…"]
}
```

- `id` is unique and is what the app uses to find a car.
- `rarity` is `"Treasure Hunt"`, `"Super Treasure Hunt"`, `"Chase"` or `null`.
- Title case varies between years (some are all caps).
- Empty or `null` fields are hidden in the detail view.
- Images are hotlinked from findmyhw.com. When a car has photos, the first one
  is always `https://findmyhw.com/media/images/<id>/<id>_1.webp`.

## Scan index (`data/scan-index.json`)

One file with every car, so the scanner can search all years without
downloading every collection file. About 1.7 MB, 320 KB compressed, and only
fetched when the scanner opens.

```json
{"built_at":"2026-10-29",
 "fields":["id","title","year","assortment","sku","number","series","rarity","img","color"],
 "cars":[
["JBB06_1","'15 LAND ROVER DEFENDER DOUBLE CAB","2025","mainline","JBB06","179","HW Dirt","",1,"Dark Red"],
…
]}
```

| Field | Value |
|---|---|
| `assortment` | Collection key (`mainline`, `premium`, `silver-series`). |
| `number` | `mainline_index`, or `series_index` when there's none. |
| `rarity` | `th`, `sth`, `chase` or empty. |
| `img` | `1` if the car has photos (the URL follows the pattern above). |
| `color` | `body_color`. |

The app looks up columns by name from `fields`, so columns can be added later.
One car per line keeps git diffs readable.

Rebuild it after any manual data change:

```bash
node scripts/build-scan-index.js
```

The weekly updater rebuilds it automatically.

## Adding or fixing data by hand

1. Put the file at `data/<year>/<collection>.json` in the format above.
2. For a new year, add it to that collection's `years` in `data/index.json`.
   For a new collection, add an entry to `assortments`.
3. Run `node scripts/build-scan-index.js`.
4. Commit and push. GitHub Pages redeploys within a minute or two.

The weekly updater only rewrites the current and next year, so manual edits
to older years are kept.
