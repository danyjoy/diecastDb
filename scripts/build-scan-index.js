#!/usr/bin/env node
/**
 * Builds data/scan-index.json: a compact, cross-year list of every car, used by
 * the app's "scan a card" feature to match OCR text against the whole catalog
 * without downloading every per-year file (~18 MB).
 *
 * Each row is [id, title, year, assortmentKey, sku, number, series, rarity, hasImage, bodyColor]
 * where `number` is mainline_index (or series_index) and `rarity` is
 * "th" | "sth" | "chase" | "". Images follow the pattern
 * https://findmyhw.com/media/images/<id>/<id>_1.webp, so only a 0/1 flag is kept.
 *
 * Run automatically at the end of scripts/update-catalog.js, or by hand:
 *   node scripts/build-scan-index.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const MANIFEST = path.join(DATA_DIR, "index.json");
const OUT = path.join(DATA_DIR, "scan-index.json");

function rarityCode(r) {
  const v = String(r || "").toLowerCase();
  if (v === "super treasure hunt") return "sth";
  if (v === "treasure hunt") return "th";
  if (v === "chase") return "chase";
  return "";
}

function buildScanIndex() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const pattern = manifest.file_pattern || "{year}/{assortment}.json";
  const rows = [];

  for (const a of manifest.assortments || []) {
    for (const year of a.years || []) {
      const rel = pattern.replace("{year}", String(year)).replace("{assortment}", String(a.key));
      const file = path.join(DATA_DIR, rel);
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const c of data.cars || []) {
        if (!c || !c.id || !c.title) continue;
        rows.push([
          c.id,
          String(c.title).trim(),
          String(year),
          a.key,
          c.sku || "",
          String(c.mainline_index || c.series_index || ""),
          String(c.series_name || "").trim(),
          rarityCode(c.rarity),
          c.images && c.images.length ? 1 : 0,
          String(c.body_color || "").trim(),
        ]);
      }
    }
  }

  const out = {
    built_at: new Date().toISOString().slice(0, 10),
    fields: ["id", "title", "year", "assortment", "sku", "number", "series", "rarity", "img", "color"],
    cars: rows,
  };
  // One row per line keeps git diffs readable while staying compact.
  const body =
    '{"built_at":' + JSON.stringify(out.built_at) +
    ',"fields":' + JSON.stringify(out.fields) +
    ',"cars":[\n' + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]}\n";
  fs.writeFileSync(OUT, body);
  return rows.length;
}

module.exports = { buildScanIndex };

if (require.main === module) {
  const n = buildScanIndex();
  console.log(`wrote ${n} cars -> data/scan-index.json`);
}
