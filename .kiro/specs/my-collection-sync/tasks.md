# Implementation Plan

- [x] 1. One-time Google Cloud setup (repo owner, manual)
  - Create the project, enable the Drive API, set up the consent screen with
    the `drive.appdata` scope and the privacy URL, publish it to production,
    and create a Web OAuth client with the origins `https://danyjoy.github.io`
    and `http://localhost:8000`.
  - Hand over the client ID to put in `GOOGLE_CLIENT_ID`.
  - _Requirements: 1.2, 7.3_

- [x] 2. Create `lists.js` with the data model and local cache
  - [x] 2.1 Module skeleton `window.DiecastLists`, ES5 style, an event
    emitter (`on("change")`), constants (`GOOGLE_CLIENT_ID`, file name,
    scope).
    - _Requirements: 2.4_
  - [x] 2.2 Document helpers: `emptyDoc`, `validateDoc` (id/year/key
    patterns, version check), `merge(a, b)` with tombstones and 90-day
    tombstone pruning.
    - _Requirements: 2.4, 2.5, 6.1, 6.2_
  - [x] 2.3 localStorage cache (`dl.lists`, `dl.dirty`, `dl.hint`), plus
    `has`, `entries`, `counts`, and `toggle` with the rule that Have it
    removes from Wishlist.
    - _Requirements: 3.2, 3.3, 3.5_

- [x] 3. Google sign-in and Drive storage
  - [x] 3.1 Load the GIS script on demand, create the token client,
    `ensureToken(interactive)`, mirror the token to sessionStorage,
    `signIn`, and `signOut` with revoke and cache clearing.
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7_
  - [x] 3.2 Drive calls: find, read, create (multipart), update (media),
    delete, and `about` for the user's name and email. Map 401, 403 and
    network errors to states.
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 7.1_

- [x] 4. Sync engine
  - A single-flight `save()` (read → merge → apply ops → write), an 800 ms
    debounce, pull on init / `visibilitychange` / `online`, `syncNow`, the
    state machine plus `change` events, `exportJSON`, and `deleteAll`.
  - _Requirements: 3.5, 6.1, 6.2, 6.3, 7.1_

- [x] 5. Checkpoint: test `lists.js` against real Google Drive
  - Done so far: the sync logic was tested against a fake Drive with two
    devices (sign-in, add/remove, cross-device removal, unreadable file never
    overwritten, delete, sign-out). The UI was checked in headless Chrome,
    browser and Telegram modes. Real Google sign-in and save to Drive confirmed
    by the repo owner on localhost.
  - On localhost, sign in, toggle a few ids, inspect the file through the
    Drive API, and sync between two browser profiles. Ask the user if
    anything is unclear.

- [x] 6. UI in `index.html` (browser mode only)
  - [x] 6.1 Add the `LISTS_ON = !isTelegram` flag. Only when it's true,
    inject `lists.js`, call `init`, and re-render the grid, detail and menu
    on `change`. In Telegram mode, nothing is loaded or added.
    - _Requirements: 0.1, 0.2, 0.3, 1.8_
  - [x] 6.2 Header account button with a sync dot, and the account bottom
    sheet (signed-out and signed-in variants, all actions, a confirm before
    Delete my data). Close it on back.
    - _Requirements: 1.1, 1.3, 1.7, 6.3, 7.1_
  - [x] 6.3 Have it / Want it toggles in `showDetail`, with `aria-pressed`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 6.4 Owned/wanted markers on grid cards, and Owned / Wanted filter
    pills joined to `matches()`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 6.5 The My cars overlay (z-index 18): tabs with counts, search, rows,
    the "not in catalog" state, open-car handoff via `loadCollection`, the
    history entry, and the popstate order.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 7. `privacy.html` and docs
  - Privacy page in the app's style. New `docs/my-collection.md` (feature
    overview, browser-only note, Google Cloud setup). Update `README.md`
    (features + docs table), `docs/development.md` (layer order, external
    services, CSP hosts, `lists.js` in the code layout), and
    `docs/features.md` (Telegram section: collection features are off in the
    Mini App).
  - _Requirements: 0.1, 7.2, 7.3_

- [x] 6.6 Have it / Want it buttons on card scanner matches (`scanOwnHtml`,
  `toggleScanOwn`), updated in place on `change`, and a toast on add/remove.
  Google's script is preloaded when the scanner opens.
  - _Requirements: 3.6_

- [x] 6.7 Replace Have it / Want it and the grid markers with one shared
  control (`ctlHtml` / `ctlBox` / `ownAct`): + that becomes − n + (copies,
  stored as `q`, `DiecastLists.step`) and a bookmark for the wishlist, on grid
  cards, the detail view, scanner matches and My cars rows.
  - _Requirements: 3.1, 3.3, 4.1, 4.2_
- [x] 6.8 Fix: closing a car opened from My cars with the in-page Back button
  also closed My cars. `closeDetail` pops its own history entry, and the
  resulting popstate now gets ignored (`SELF_POP`).
  - _Requirements: 5.5_

- [x] 6.9 Polish: grid controls side by side (bookmark, then + in the
  corner); no bookmark on owned cars; dark-theme controls off the white
  photo (detail, scanner, My cars), with a solid blue "Add to collection" in
  the detail view; toast sized to its text, so short messages stay on one
  line.
  - _Requirements: 3.1, 3.3_

- [x] 6.10 Grid shows a ✓ (×n) for owned cars instead of − n +; the count is
  changed in the detail view. Rows with controls (My cars, scanner) are
  top-aligned so the photo lines up with the title.
  - _Requirements: 4.1_

- [ ] 8. Final manual test pass
  - Run the checks in the design's Testing section on desktop Chrome and
    Safari, a phone over the HTTPS tunnel, and the Telegram Mini App (after
    deploying) to confirm it's still browse-only.
