#!/usr/bin/env node
/**
 * Weekly catalog updater for the Hot Wheels Mini App.
 *
 * Re-scrapes the "live" years (current calendar year + next year) for each
 * tracked collection and writes the per-year JSON the app reads, then updates
 * data/index.json so any newly-appearing year is added to the collection's
 * year list. Historical years are left untouched.
 *
 * Collections (see COLLECTIONS below): Mainline, Premium, Silver Series.
 *
 * Run by .github/workflows/update-catalog.yml. The findmyhw.com API sits behind
 * an AWS WAF, so a cookie carrying a valid `aws-waf-token` must be provided via
 * the WAF_COOKIE environment variable (a repo Actions secret). When the token
 * expires the scrape fails loudly rather than committing empty data — refresh
 * the secret from a fresh browser request (DevTools > Network > copy as fetch).
 *
 * Usage:
 *   WAF_COOKIE="aws-waf-token=...; _ga=..." node scripts/update-catalog.js
 *   # optional override of which years to scrape:
 *   YEARS=2026,2027 WAF_COOKIE="..." node scripts/update-catalog.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MANIFEST = path.join(DATA_DIR, "index.json");

const BASE = "https://findmyhw.com/api/products.php";
const LIMIT = 30;

// Which collections to refresh, and how each is queried on findmyhw.com.
// `param` is the API filter key; `value` its value; `slug` the output filename.
const COLLECTIONS = [
  { slug: "mainline", param: "assortment", value: "Mainline" },
  { slug: "premium", param: "segment", value: "Premium" },
  { slug: "silver-series", param: "segment", value: "Silver Series" },
];

// Live years = current year + next year (auto-rolls over each January).
function liveYears() {
  if (process.env.YEARS) {
    return process.env.YEARS.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const y = new Date().getFullYear();
  return [String(y), String(y + 1)];
}

const COOKIE = process.env.WAF_COOKIE || "";
if (!COOKIE) {
  console.error("WAF_COOKIE is not set. Provide a cookie with a valid aws-waf-token.");
  process.exit(1);
}

const headers = (coll) => ({
  accept: "application/json",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  Referer: `https://findmyhw.com/en/catalog?${coll.param}=${encodeURIComponent(coll.value)}`,
  cookie: COOKIE,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(coll, years, page) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(LIMIT),
    sort: "created_at",
    order: "desc",
    release_year: years.join(","),
  });
  params.set(coll.param, coll.value);
  return `${BASE}?${params.toString()}`;
}

async function fetchPage(coll, years, page, attempt = 1) {
  try {
    const res = await fetch(buildUrl(coll, years, page), { headers: headers(coll), method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.success !== true || !Array.isArray(json.data)) {
      throw new Error("unexpected response shape (WAF block or expired cookie?)");
    }
    return json;
  } catch (err) {
    if (attempt < 4) {
      await sleep(1000 * attempt);
      return fetchPage(coll, years, page, attempt + 1);
    }
    throw err;
  }
}

function sortCars(coll, items) {
  const toInt = (v) => {
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
  };
  if (coll.param === "segment") {
    items.sort((a, b) => {
      const aa = String(a.assortment || "").toLowerCase();
      const ba = String(b.assortment || "").toLowerCase();
      if (aa !== ba) return aa < ba ? -1 : 1;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
    return items;
  }
  items.sort((a, b) => {
    const ai = toInt(a.mainline_index), bi = toInt(b.mainline_index);
    if (ai !== bi) return ai - bi;
    const si = toInt((a.series_index || "").split("/")[0]);
    const sj = toInt((b.series_index || "").split("/")[0]);
    if (si !== sj) return si - sj;
    return String(a.id).localeCompare(String(b.id));
  });
  return items;
}

// Scrape one collection across the given years; returns a Map year -> cars[].
async function scrapeCollection(coll, years) {
  console.log(`\n== ${coll.value} (${coll.param}) for ${years.join(", ")} ==`);
  const first = await fetchPage(coll, years, 1);
  const totalPages = first.pagination?.total_pages ?? 1;
  const total = first.pagination?.total ?? first.data.length;
  console.log(`  total ${total} across ${totalPages} page(s)`);

  const byId = new Map();
  for (const item of first.data) byId.set(item.id, item);
  for (let page = 2; page <= totalPages; page++) {
    const json = await fetchPage(coll, years, page);
    for (const item of json.data) byId.set(item.id, item);
    await sleep(400);
  }

  const byYear = new Map();
  for (const car of byId.values()) {
    const y = String(car.release_year || "unknown");
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(car);
  }
  return { byYear, total };
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
}

// Ensure the manifest's assortment for `slug` lists `year` (newest-first).
function ensureYearInManifest(manifest, slug, year) {
  const a = (manifest.assortments || []).find((x) => x.key === slug);
  if (!a) return false;
  a.years = a.years || [];
  if (a.years.indexOf(year) === -1) {
    a.years.push(year);
    a.years.sort((x, y) => parseInt(y, 10) - parseInt(x, 10));
    return true;
  }
  return false;
}

async function main() {
  const years = liveYears();
  console.log(`Updating live years: ${years.join(", ")}`);

  const manifest = readManifest();
  let manifestChanged = false;
  let wroteAny = false;

  for (const coll of COLLECTIONS) {
    let result;
    try {
      result = await scrapeCollection(coll, years);
    } catch (err) {
      // Fail the whole run on a hard error so a broken cookie doesn't pass silently.
      console.error(`FAILED scraping ${coll.value}: ${err.message}`);
      process.exit(1);
    }

    // Only write years we explicitly asked for, and only when non-empty — never
    // overwrite an existing file with zero cars (e.g. a not-yet-released year).
    for (const year of years) {
      const cars = sortCars(coll, result.byYear.get(year) || []);
      if (cars.length === 0) {
        console.log(`  ${year}/${coll.slug}: 0 cars — skipped (not released yet?)`);
        continue;
      }
      const output = {
        source: "findmyhw.com",
        collection: coll.slug,
        release_year: Number(year) || year,
        scraped_at: new Date().toISOString(),
        count: cars.length,
        cars,
      };
      const outDir = path.join(DATA_DIR, String(year));
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${coll.slug}.json`), JSON.stringify(output, null, 2));
      console.log(`  wrote ${cars.length} cars -> data/${year}/${coll.slug}.json`);
      wroteAny = true;
      if (ensureYearInManifest(manifest, coll.slug, String(year))) manifestChanged = true;
    }
  }

  if (manifestChanged) {
    manifest.updated_at = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    console.log("\nupdated data/index.json (new year added)");
  }

  if (!wroteAny) {
    console.error("\nNo data written for any collection — treating as failure.");
    process.exit(1);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Updater crashed:", err.message);
  process.exit(1);
});
