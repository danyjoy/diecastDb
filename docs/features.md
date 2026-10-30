# Browsing features

All of this lives in `index.html`. For the card scanner, see
[card-scanner.md](card-scanner.md).

## Collections and years

- The menu under the search bar lists the collections from
  `data/index.json`: **Mainline**, **Premium** and **Silver Series**.
- The year button next to the title opens a list of the years that collection
  has, newest first.
- The app opens on the default collection (Mainline) and the current calendar
  year, or that collection's newest year if the current year has no data.
- Switching collection keeps the selected year when the new collection has it.

Only one collection-year file is loaded at a time (for example
`data/2026/mainline.json`).

## Search

The search box matches every word you type (in any order) against a car's
title, series, assortment, SKU, casting number, brand (OEM), rarity, body
colour and collector number.

## Filters

The filter row adapts to the loaded collection:

- **All**: clears the filters.
- **Super TH**, **Treasure Hunt**: Mainline Treasure Hunts.
- **Chase**: Premium chase cars.
- **Soft Chase**: Silver Series only. The soft chase is the car with a metal
  base in a series. It's only marked when a series has exactly one metal-base
  car, so themed sets with several metal cars aren't mislabelled.
- **Series** (or **Assortment** then **Series**): opens a searchable list.
  Mainline groups by series. Premium and Silver Series group by assortment
  (Car Culture, Boulevard, Pop Culture, …), then by series inside it.

Cards are highlighted by rarity: silver for Treasure Hunt, gold for Super
Treasure Hunt and Chase, a silver outline for Soft Chase.

## Car details

Tapping a car opens a full-screen detail view:

- Every non-empty field from the catalog (year, segment, assortment, series,
  numbers, SKU, casting number, OEM, scale, colours, wheels, designers,
  country of origin).
- Series, assortment and OEM are tappable and filter the grid to that value.
- **Copy** button next to the name (handy for pasting into a bot command).
- **Gallery** of every photo, and a **download** button that saves the photo as
  JPEG. Images come from findmyhw.com, which doesn't allow cross-origin
  downloads, so they are converted through the [wsrv.nl](https://wsrv.nl)
  image proxy.
- **Zoom viewer**: tap the photo. Pinch, mouse wheel or double-tap to zoom,
  drag to pan, swipe left/right for the next photo, swipe down to close.
  Arrow keys, `+`, `-`, `0` and `Esc` work on desktop.

## Navigation

- The phone's back gesture/button closes the top overlay (zoom viewer, then
  scanner, then detail view) instead of leaving the app. Each overlay pushes
  a browser history entry.
- A go-to-top button appears once the header scrolls out of view.

## Telegram Mini App

The same page runs inside Telegram. When it detects a real Telegram launch
(`Telegram.WebApp.initData` is non-empty), it:

- uses Telegram's native **Back** button and hides the in-page one;
- sets Telegram's header and background to the app's dark colour (the app is
  always dark, even on a light Telegram theme);
- uses Telegram's native **download** dialog (Bot API 8.0+);
- adds light haptic feedback (go-to-top, copy, scanner shutter);
- turns off Telegram's swipe-down-to-minimise while the zoom viewer is open.

Outside Telegram it behaves as a normal web page.

## Analytics

The page loads Cloudflare Web Analytics (cookieless) at the end of
`index.html`.
