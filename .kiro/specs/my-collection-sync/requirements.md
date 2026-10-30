# Requirements: My Collection & Wishlist (synced to the user's own Google Drive)

## Introduction

In a normal web browser, users can sign in with Google and mark cars as
**owned** (My Collection) or **wanted** (Wishlist). The app has no server and
keeps no user data. The lists are saved in the user's own Google Drive, in
the hidden **app data folder** (`appDataFolder`). Only this app can read that
folder; it doesn't show up in the user's Drive file list and doesn't touch
their other files. The OAuth scope is `drive.appdata`, which Google lists as
non-sensitive, so the app doesn't need Google's security review.

Inside the **Telegram Mini App**, the app stays browse-only. It has no
sign-in and no collection features, and looks and behaves exactly as it does
today. (Google blocks OAuth sign-in inside embedded web views such as
Telegram's anyway.)

### Glossary

- **List**: either *Collection* (cars the user owns) or *Wishlist* (cars the
  user wants).
- **Entry**: one car in a list, keyed by the catalog car `id` (e.g. `JBB06_1`).
- **Browser mode**: the app opened in a normal web browser (the existing
  Telegram check, non-empty `Telegram.WebApp.initData`, is false).
- **Telegram mode**: the app opened as a Telegram Mini App (that check is
  true).
- **Local cache**: a copy of the lists in the browser's `localStorage`, used
  to show them right away and to queue changes made while offline.

## Requirements

### Requirement 0: Browser only

**User story:** As the app owner, I want the collection features only on the
website, so that the Telegram Mini App stays a simple catalog browser.

**Acceptance criteria**

1. WHEN the app runs in Telegram mode THEN it SHALL NOT show the account
   button, the + / bookmark controls, the
   Owned / Wanted filters or the My cars screen.
2. WHEN the app runs in Telegram mode THEN it SHALL NOT load the Google
   sign-in script, the collection code, or make any request to Google.
3. WHEN the app runs in browser mode THEN all the features below SHALL be
   available.

### Requirement 1: Sign in with Google

**User story:** As a collector using the website, I want to sign in with my
Google account, so that my collection is saved somewhere I control.

**Acceptance criteria**

1. WHEN the app runs in browser mode THEN the header SHALL show an
   account button that opens a "Sign in with Google" option.
2. WHEN the user signs in THEN the app SHALL request only the
   `https://www.googleapis.com/auth/drive.appdata` scope.
3. WHEN sign-in succeeds THEN the account button SHALL show the user's name
   or initial, and the account menu SHALL show their email address.
4. IF the user closes the Google popup or refuses consent THEN the app SHALL
   stay signed out and show a short message, with no error state left behind.
5. The app SHALL keep the Google access token in memory (and at most in
   `sessionStorage` until it expires). It SHALL never write the token to
   `localStorage`, to the URL, or to logs.
6. WHEN the access token has expired and the user makes a change THEN the app
   SHALL get a new token in that click handler (so the browser allows the
   popup) and then save.
7. WHEN the user taps "Sign out" THEN the app SHALL revoke the token, clear
   the local cache, and return to the signed-out state.
8. The app SHALL keep working as it does today for users who never sign in.

### Requirement 2: Storage in the user's Google Drive

**User story:** As a collector, I want my lists stored in my own account
and not on someone else's server, so that my data stays private and stays
mine.

**Acceptance criteria**

1. WHEN signed in THEN the app SHALL store the lists in a single JSON file,
   `diecastdb-lists.json`, in the user's Drive `appDataFolder`.
2. IF that file doesn't exist THEN the app SHALL create it on the first save.
3. The app SHALL talk only to Google's APIs directly from the browser. No
   other server SHALL receive list data.
4. The stored format SHALL carry a `version` number so it can change later
   without losing data.
5. IF the stored file can't be parsed THEN the app SHALL NOT overwrite it.
   It SHALL tell the user and stop syncing.

### Requirement 3: Mark a car as owned or wanted

**User story:** As a collector, I want to mark a car as owned or wanted from
its detail page, so that building my lists is quick.

**Acceptance criteria**

1. WHEN the detail view is open in browser mode THEN it SHALL show a **+**
   control to add the car to the Collection, which turns into **− n +** (the
   number of copies owned, 1–999; − at 1 removes the car), and a
   **bookmark** toggle for the Wishlist. The same controls SHALL appear on
   grid cards, scanner matches and My cars rows, and tapping them SHALL NOT
   open the car.
2. WHEN the user taps a toggle THEN its state SHALL change right away, and
   the change SHALL be saved to Drive in the background.
3. WHEN a car is first added to the Collection THEN it SHALL be removed from
   the Wishlist if it was there, and the bookmark SHALL be hidden while the
   car is owned.
4. IF the user isn't signed in THEN tapping a toggle SHALL offer to sign in,
   and apply the change once sign-in succeeds.
5. IF a save fails THEN the app SHALL keep the change in the local cache,
   show that it isn't synced yet, and retry on the next change, the next app
   start, or a manual "Sync now".
6. WHEN the card scanner shows its matches in browser mode THEN each match
   SHALL have the + and bookmark controls, which save the car without
   leaving the scanner and confirm with a short message. Tapping the rest of
   the row SHALL still open the car's detail.

### Requirement 4: See which cars I own or want while browsing

**User story:** As a collector, I want the grid to show which cars I already
have or want, so that I can spot them while browsing a year.

**Acceptance criteria**

1. WHEN a grid card's car is in the Collection THEN the card SHALL show a
   tick (with ×n for more than one copy). Tapping it SHALL open the car,
   where the count can be changed.
2. WHEN a grid card's car is in the Wishlist THEN its bookmark SHALL be
   filled.
3. The controls SHALL NOT hide the existing TH / STH / Chase / Soft Chase
   badges.
4. The filter row SHALL offer **Owned** and **Wanted** filters for the loaded
   collection-year when the user has lists.

### Requirement 5: View my lists

**User story:** As a collector, I want one screen with all my owned and wanted
cars across every year and collection, so that I can review them.

**Acceptance criteria**

1. The account menu SHALL open a **My cars** screen with two tabs:
   *Collection* and *Wishlist*, each with a count.
2. The screen SHALL list cars from every year and collection, newest year
   first, with photo, title, year, collection and rarity.
3. The screen SHALL have a search box that filters the list by title, series
   or SKU.
4. WHEN the user taps a car THEN the app SHALL load that car's collection and
   year and open its detail view.
5. The screen SHALL push a browser history entry, so the phone's back gesture
   closes it, following the existing overlay pattern. WHEN a car opened from
   My cars is closed (in-page Back button, Telegram-style back, or the
   browser/phone back) THEN the app SHALL return to My cars, not the grid.
6. IF a stored car id is no longer in the catalog THEN the screen SHALL still
   list it using the saved title and mark it "not in catalog".

### Requirement 6: Sync across devices

**User story:** As a collector with a phone and a laptop, I want the same lists
on both, so that I don't have to keep them in sync myself.

**Acceptance criteria**

1. WHEN the app starts signed in, or the tab becomes visible again THEN the
   app SHALL fetch the stored lists and merge them with the local cache.
2. WHEN saving THEN the app SHALL read the latest stored copy, apply the
   pending changes to it, and write the result, so that changes made on
   another device are not lost.
3. The account menu SHALL show the sync state: *Synced*, *Syncing…*,
   *Not synced (offline)* or *Sync error*, and offer **Sync now**.

### Requirement 7: Export and privacy

**User story:** As a collector, I want to download my data and know where it
lives, so that I trust the feature.

**Acceptance criteria**

1. The account menu SHALL offer **Export** (download the lists as JSON) and
   **Delete my data** (delete the Drive file after confirmation).
2. The repository SHALL include a privacy page (`privacy.html`) describing
   what is stored, where, and how to remove it. Google's OAuth consent screen
   needs this link.
3. The docs SHALL describe the Google Cloud setup (OAuth client ID,
   authorised JavaScript origins, consent screen).

## Out of scope

- Any collection, wishlist or sign-in feature inside the Telegram Mini App.
- Any server, database or account system of our own.
- Sign-in with Apple, Microsoft, or other providers.
- Sharing lists with other people or public profile pages.
- Quantities, prices, purchase dates or notes per car (the format leaves room
  for them later).
