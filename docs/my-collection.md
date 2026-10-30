# My collection & wishlist

In a normal web browser, users can sign in with Google and mark cars as
owned (collection, with the number of copies) or wanted (wishlist). There is no server: the
lists are saved in the user's own Google Drive, in the hidden app data folder
(`appDataFolder`). Only this app can open that folder, and the app can't see
any other Drive file.

The **Telegram Mini App** stays browse-only. In Telegram, `lists.js` and
Google's script are never loaded, and none of the UI below appears.

The spec is in `.kiro/specs/my-collection-sync/`.

## What users get

- **Account button** next to the search box. A person icon when signed out,
  the user's initial when signed in. An amber dot means changes aren't saved
  to Drive yet; a red dot means a sync problem.
- **Account sheet**: Sign in with Google; once signed in, the sync status,
  **My cars**, **Sync now**, **Export (JSON)**, **Delete my data** and
  **Sign out**. Links to [privacy.html](../privacy.html).
- **Add / wishlist controls** on every grid card (top-right of the photo),
  in the car detail view, on card scanner matches and on My cars rows:
  - **+** adds the car to the collection. It then turns into **− n +**, the
    number of copies owned (up to 999). **−** at 1 removes the car.
  - The **bookmark** adds the car to the wishlist or removes it (filled pink
    when on the wishlist). A short message confirms it.
  - Adding a wishlisted car to the collection takes it off the wishlist.
  - Tapping a control while signed out starts sign-in, then adds the car.
  - Tapping a control never opens the car. Tapping the rest of the card or
    row does.
- **Owned / Wanted filters** in the filter row, for the loaded collection and
  year. They combine with the other filters.
- **My cars** screen: Collection and Wishlist tabs across every year and
  collection, with search. Tapping a car loads its year and opens the detail.
  Cars that left the catalog are listed as "Not in catalog".

## How it works

`lists.js` (exposed as `window.DiecastLists`) holds the logic. `index.html`
injects it at startup only when `LISTS_ON` (`!inTelegram`) is true.

- **Sign-in**: Google Identity Services token model, scope
  `https://www.googleapis.com/auth/drive.appdata` only. Access tokens last
  about an hour. Without a backend there are no refresh tokens, so the token
  is kept in memory and `sessionStorage` (never `localStorage`). When it has
  expired, the next tap on +, −, the bookmark or Sync now gets a new one through
  a popup that closes on its own.
- **Storage**: one file, `diecastdb-lists.json`, in `appDataFolder`:

  ```json
  {
    "app": "diecastDb", "version": 1, "updated_at": "2026-10-30T12:00:00.000Z",
    "collection": { "JBB06_1": { "y": "2025", "a": "mainline", "t": "'15 LAND ROVER DEFENDER DOUBLE CAB", "at": 1793361600000, "q": 2 } },
    "wishlist": {},
    "removed": { "collection": {}, "wishlist": {} }
  }
  ```

  `y` and `a` are the year and collection key needed to open the car. `t` is
  the title, so My cars can show a name before the scan index loads. `q` is
  the number of copies owned (collection only; missing means 1). `at` is the
  time of the last change to that car. `removed` holds removal times (kept 90 days), so
  a car removed on one device isn't brought back by another.
- **Local copy** in `localStorage`: `dl.lists` (the document), `dl.dirty`
  (changes not yet saved) and `dl.hint` (name and email). Cleared on sign-out.
- **Sync**: reads the Drive file first. With no local changes, the app takes
  Drive's copy. With local changes, it merges (the latest add or removal of
  each car wins) and writes the result. Saves are debounced by 800 ms. Sync
  runs on sign-in, after changes, when the tab becomes visible again, and
  when the browser comes back online. Without a valid token, the status says
  "Tap Sync now".
- **Safety**: a Drive file that can't be read, or that has a newer `version`,
  is never overwritten. Stored text is validated (id, year and collection-key
  patterns) and escaped before it's shown.

## Google Cloud setup

Already done for project **diecastDb** (client ID in `GOOGLE_CLIENT_ID` at
the top of `lists.js`). To redo it, in
[console.cloud.google.com](https://console.cloud.google.com):

1. Create a project and enable the **Google Drive API**
   (APIs & Services → Library).
2. **Google Auth Platform → Get started**: app name `diecastDb`, audience
   **External**, your contact email.
3. **Data Access → Add or remove scopes**: add
   `https://www.googleapis.com/auth/drive.appdata`. It must be listed under
   non-sensitive scopes.
4. **Branding**: home page `https://danyjoy.github.io/diecastDb/`, privacy
   policy `https://danyjoy.github.io/diecastDb/privacy.html`, authorized
   domain `danyjoy.github.io`. Don't upload a logo: that starts Google's brand
   verification.
5. **Clients → Create client → Web application**. Authorized JavaScript
   origins: `https://danyjoy.github.io` and `http://localhost:8000`. No
   redirect URIs.
6. **Audience**: while the app is in *Testing*, only listed test users can
   sign in and grants expire after 7 days. Click **Publish app** once
   `privacy.html` is live.

The client ID is public by design. Never put the client secret in the repo;
the app doesn't use it.

To test on another origin (for example a `trycloudflare.com` tunnel), add that
origin to the client's Authorized JavaScript origins first. Otherwise Google
answers `origin_mismatch`.

## Known limits

- Google blocks sign-in inside apps' built-in browsers (a link opened from a
  Telegram chat, Instagram, …). The app then shows a message asking the user
  to open the site in Chrome or Safari.
- On a new visit (new tab), the lists show from the local copy straight away,
  but fetching changes from other devices needs one tap (Sync now, or any
  +, − or bookmark tap), because getting a new token requires a user gesture.
- Two devices saving in the same second can still overwrite each other's
  last change, because Drive has no conditional writes for this upload type.
  The merge keeps that window small.

## Manual test checklist

- Signed out: the account sheet shows Sign in with Google. + on a car signs
  in and then adds it.
- Grid: + turns into − 1 +, + again shows 2, − back to 0 shows + again. The
  bookmark fills pink. Neither opens the car.
- Scanner: scan or type a car name, tap + or the bookmark on a result. The
  scanner stays open, and the car shows in My cars.
- My cars → open a car → Back (in-page button and phone back gesture): you
  return to My cars, not the main grid.
- Reload within the hour: no popup, status *Saved to your Google Drive*.
- Two browser profiles with the same account: add on A, switch to B (tab
  focus) and the car appears. Remove on B, add another car on A, and the
  removal isn't undone.
- DevTools → Offline, toggle a car: amber dot. Back online: it syncs.
- Export downloads `diecastdb-lists.json`. Delete my data empties the lists.
  Drive → Settings → Manage apps shows diecastDb with hidden app data.
- Telegram Mini App: no account button, buttons, markers or Owned/Wanted
  pills, and no requests to `accounts.google.com`, `googleapis.com` or
  `lists.js`.
