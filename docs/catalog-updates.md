# Weekly catalog updates

`.github/workflows/update-catalog.yml` keeps the live years current.

## Schedule

- Every **Monday at 06:00 UTC**, and on demand from the repository's
  **Actions** tab (**Update Hot Wheels catalog → Run workflow**).
- Runs `node scripts/update-catalog.js` on Node 20.
- If anything under `data/` changed, it commits as `github-actions[bot]` with
  the message `Weekly catalog refresh (YYYY-MM-DD)` and pushes to `main`,
  which redeploys GitHub Pages.

## What the script does

`scripts/update-catalog.js`:

1. Picks the **live years**: the current calendar year and the next one. Older
   years are never touched.
2. Scrapes each collection from the findmyhw.com product API, 30 cars per
   page, with retries:

   | File name | API filter |
   |---|---|
   | `mainline` | `assortment=Mainline` |
   | `premium` | `segment=Premium` |
   | `silver-series` | `segment=Silver Series` |

3. Sorts the cars: Mainline by collector number then series number; Premium
   and Silver Series by assortment then title.
4. Writes `data/<year>/<collection>.json` for each live year. A year with
   **zero cars is skipped**, so an empty response never overwrites real data
   (for example a year that isn't released yet).
5. Adds any new year to `data/index.json`.
6. Rebuilds `data/scan-index.json` so the scanner knows the new cars.

The run **fails** (and commits nothing) if a collection can't be scraped or if
no data was written at all, so a broken cookie doesn't pass silently.

## The `WAF_COOKIE` secret

The findmyhw.com API sits behind an AWS WAF. The script needs a browser cookie
containing a valid `aws-waf-token`, stored as the repository secret
**`WAF_COOKIE`** (Settings → Secrets and variables → Actions).

When the token expires, the workflow fails with an error like
`unexpected response shape (WAF block or expired cookie?)`. To refresh it:

1. Open https://findmyhw.com/en/catalog in a desktop browser.
2. Open DevTools → Network and find a request to `api/products.php`.
3. Copy its `cookie` request header.
4. Paste it as the new value of the `WAF_COOKIE` secret and re-run the workflow.

## Running it locally

```bash
WAF_COOKIE="aws-waf-token=…; _ga=…" node scripts/update-catalog.js

# Only specific years:
YEARS=2026,2027 WAF_COOKIE="…" node scripts/update-catalog.js
```

Node 18+ is needed (it uses the built-in `fetch`).
