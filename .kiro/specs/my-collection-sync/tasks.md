# Implementation Plan

- [ ] 1. One-time Google Cloud setup (repo owner, manual)
  - Create the project, enable the Drive API, set up the consent screen with
    the `drive.appdata` scope and the privacy URL, publish it to production,
    and create a Web OAuth client with the origins `https://danyjoy.github.io`
    and `http://localhost:8000`.
  - Hand over the client ID to put in `GOOGLE_CLIENT_ID`.
  - _Requirements: 1.2, 7.3_

- [ ] 2. Create `lists.js` with the data model and local cache
  - [ ] 2.1 Module skeleton `window.DiecastLists`, ES5 style, an event
    emitter (`on("change")`), constants (`GOOGLE_CLIENT_ID`, file name,
    scope).
    - _Requirements: 2.5_
  - [ ] 2.2 Document helpers: `emptyDoc`, `validateDoc` (id/year/key
    patterns, version check), `merge(a, b)` with tombstones and 90-day
    tombstone pruning.
    - _Requirements: 2.5, 2.6, 6.1, 6.2_
  - [ ] 2.3 localStorage cache (`dl.lists`, `dl.pending`, `dl.provider`,
    `dl.hint`), plus `has`, `entries`, `counts`, and `toggle` with the rule
    that Have it removes from Wishlist.
    - _Requirements: 3.2, 3.3, 3.5_

- [ ] 3. Google provider
  - [ ] 3.1 Load the GIS script on demand, create the token client,
    `ensureToken(interactive)`, mirror the token to sessionStorage,
    `signIn`, and `signOut` with revoke and cache clearing.
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7_
  - [ ] 3.2 Drive calls: find, read, create (multipart), update (media),
    delete, and `about` for the user's name and email. Map 401, 403 and
    network errors to states.
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 7.1_

- [ ] 4. Telegram CloudStorage provider
  - Check the current limits on core.telegram.org/bots/webapps. Write the
    `l_0..l_n` chunks with `l_meta` last, read them back, clean up leftover
    chunks, and fall back to local-only on clients older than Bot API 6.9.
  - _Requirements: 2.4_

- [ ] 5. Sync engine
  - A single-flight `save()` (read → merge → apply ops → write), an 800 ms
    debounce, pull on init / `visibilitychange` / `online`, `syncNow`, the
    state machine plus `change` events, `exportJSON`, and `deleteAll`.
  - _Requirements: 3.5, 6.1, 6.2, 6.3, 7.1_

- [ ] 6. Checkpoint: test `lists.js` in the browser console
  - On localhost, sign in, toggle a few ids, inspect the file through the
    Drive API, and sync between two browser profiles. Ask the user if
    anything is unclear.

- [ ] 7. UI in `index.html`
  - [ ] 7.1 Load `lists.js`, call `init` after the Telegram setup, and
    re-render the grid, detail and menu on `change`.
    - _Requirements: 1.8_
  - [ ] 7.2 Header account button with a sync dot, and the account bottom
    sheet (signed-out, signed-in and Telegram variants, all actions, a
    confirm before Delete my data). Close it on back.
    - _Requirements: 1.1, 1.3, 1.7, 6.3, 7.1_
  - [ ] 7.3 Have it / Want it toggles in `showDetail`, with `aria-pressed`
    and haptic feedback in Telegram.
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ] 7.4 Owned/wanted markers on grid cards, and Owned / Wanted filter
    pills joined to `matches()`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ] 7.5 The My cars overlay (z-index 18): tabs with counts, search, rows,
    the "not in catalog" state, open-car handoff via `loadCollection`, the
    history entry, the popstate order, and Telegram's BackButton.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 8. `privacy.html` and docs
  - Privacy page in the app's style. New `docs/my-collection.md` (feature
    overview + Google Cloud setup). Update `README.md` (features + docs
    table), `docs/development.md` (layer order, external services, CSP
    hosts, `lists.js` in the code layout), and `docs/features.md`.
  - _Requirements: 7.2, 7.3_

- [ ] 9. Final manual test pass
  - Run the checks in the design's Testing section on desktop Chrome and
    Safari, a phone over the HTTPS tunnel, and Telegram (after deploying
    from the branch preview or main).
