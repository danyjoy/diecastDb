// My Collection & Wishlist, saved in the signed-in user's own Google Drive.
//
// Browser only: index.html loads this file only outside the Telegram Mini App.
// There is no server. The lists live in one JSON file in the user's hidden
// Drive "app data" folder (scope drive.appdata), which only this app can see.
// A copy is kept in localStorage so the lists show instantly and changes made
// offline aren't lost.
//
// Exposed as window.DiecastLists. See .kiro/specs/my-collection-sync/design.md.
(function () {
  "use strict";

  // Public OAuth client id (Google Cloud project "diecastDb"). Not a secret.
  var GOOGLE_CLIENT_ID = "731989375593-ot9jas2e8400h1r7tp2g9r858haq0t8e.apps.googleusercontent.com";
  var SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  var GIS_SRC = "https://accounts.google.com/gsi/client";
  var API = "https://www.googleapis.com";
  var FILE_NAME = "diecastdb-lists.json";
  var VERSION = 1;
  var LISTS = ["collection", "wishlist"];
  var TOMBSTONE_DAYS = 90;
  var MAX_QTY = 999;
  var SAVE_DELAY = 800;          // ms; several quick toggles become one write
  var TOKEN_MARGIN = 2 * 60000;  // treat a token as expired 2 minutes early

  // Storage keys. The access token only ever goes to sessionStorage.
  var K_DOC = "dl.lists", K_DIRTY = "dl.dirty", K_USER = "dl.hint", K_TOKEN = "dl.token";

  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var YEAR_RE = /^\d{4}$/;
  var KEY_RE = /^[a-z0-9-]{1,30}$/;

  // ---------- State ----------
  var doc = emptyDoc();   // local copy, with local changes applied
  var dirty = false;      // local changes not yet written to Drive
  var rev = 0;            // bumps on every local change
  var user = null;        // { name, email } once signed in
  var token = null, tokenExp = 0;
  var state = "signed-out", message = "";
  var listeners = [];
  var saveTimer = null;
  var syncP = null, syncAgain = false;
  var lastStamp = 0;

  // ---------- Small helpers ----------
  function now() { return Date.now(); }
  // Monotonic timestamps, so add → remove → add in the same millisecond still orders.
  function stamp() { var t = now(); lastStamp = t > lastStamp ? t : lastStamp + 1; return lastStamp; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function fail(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  function emit(what) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](what || {}); } catch (e) {}
    }
  }
  function setState(s, msg) {
    state = s; message = msg || "";
    emit({ state: true });
  }

  // ---------- Document ----------
  function emptyDoc() {
    return { app: "diecastDb", version: VERSION, updated_at: null,
             collection: {}, wishlist: {}, removed: { collection: {}, wishlist: {} } };
  }

  // Parse and clean a stored document. Throws code "unreadable" for anything
  // that isn't ours or is a newer version, so we never overwrite it.
  function validateDoc(raw) {
    if (!raw || typeof raw !== "object" || raw.app !== "diecastDb") throw fail("unreadable");
    if (typeof raw.version !== "number" || raw.version > VERSION) throw fail("unreadable");
    var out = emptyDoc();
    out.updated_at = typeof raw.updated_at === "string" ? raw.updated_at.slice(0, 40) : null;
    var removed = (raw.removed && typeof raw.removed === "object") ? raw.removed : {};
    for (var l = 0; l < LISTS.length; l++) {
      var name = LISTS[l];
      var src = (raw[name] && typeof raw[name] === "object") ? raw[name] : {};
      for (var id in src) {
        if (!own(src, id) || !ID_RE.test(id)) continue;
        var e = src[id];
        if (!e || typeof e !== "object") continue;
        var y = String(e.y || ""), a = String(e.a || "");
        if (!YEAR_RE.test(y) || !KEY_RE.test(a)) continue;
        var at = Number(e.at);
        out[name][id] = { y: y, a: a, t: typeof e.t === "string" ? e.t.slice(0, 200) : "",
                          at: isFinite(at) && at > 0 ? at : 1 };
        if (name === "collection") out[name][id].q = cleanQty(e.q);
      }
      var rm = (removed[name] && typeof removed[name] === "object") ? removed[name] : {};
      for (var rid in rm) {
        if (!own(rm, rid) || !ID_RE.test(rid)) continue;
        var rt = Number(rm[rid]);
        if (isFinite(rt) && rt > 0) out.removed[name][rid] = rt;
      }
    }
    return out;
  }

  // Copies owned of one car: a whole number 1..MAX_QTY (older files have none: 1).
  function cleanQty(q) {
    q = Math.floor(Number(q));
    return isFinite(q) && q >= 1 ? Math.min(q, MAX_QTY) : 1;
  }

  // Combine two copies. For each car the latest action wins: changed at "at",
  // or removed at the tombstone time. Tombstones older than 90 days are dropped.
  function merge(a, b) {
    var out = emptyDoc();
    var cutoff = now() - TOMBSTONE_DAYS * 864e5;
    for (var l = 0; l < LISTS.length; l++) {
      var n = LISTS[l], ids = {}, id;
      for (id in a[n]) if (own(a[n], id)) ids[id] = 1;
      for (id in b[n]) if (own(b[n], id)) ids[id] = 1;
      for (id in a.removed[n]) if (own(a.removed[n], id)) ids[id] = 1;
      for (id in b.removed[n]) if (own(b.removed[n], id)) ids[id] = 1;
      for (id in ids) {
        var ea = a[n][id], eb = b[n][id];
        var e = ea && eb ? (eb.at > ea.at ? eb : ea) : (ea || eb);
        var ra = a.removed[n][id] || 0, rb = b.removed[n][id] || 0;
        var r = ra > rb ? ra : rb;
        if (e && e.at > r) {
          out[n][id] = { y: e.y, a: e.a, t: e.t, at: e.at };
          if (n === "collection") out[n][id].q = cleanQty(e.q);
        }
        else if (r && r >= cutoff) out.removed[n][id] = r;
      }
    }
    out.updated_at = a.updated_at > b.updated_at ? a.updated_at : b.updated_at;
    return out;
  }

  function countOf(d, n) { var c = 0; for (var id in d[n]) if (own(d[n], id)) c++; return c; }

  // ---------- Local cache ----------
  function loadCache() {
    try { user = JSON.parse(lsGet(K_USER) || "null"); } catch (e) { user = null; }
    if (!user || typeof user.email !== "string") user = null;
    try { doc = validateDoc(JSON.parse(lsGet(K_DOC) || "null")); } catch (e) { doc = emptyDoc(); }
    dirty = lsGet(K_DIRTY) === "1";
    try {
      var t = JSON.parse(ssGet(K_TOKEN) || "null");
      if (t && typeof t.t === "string" && t.exp > now()) { token = t.t; tokenExp = t.exp; }
    } catch (e) {}
  }
  function persist() {
    lsSet(K_DOC, JSON.stringify(doc));
    if (dirty) lsSet(K_DIRTY, "1"); else lsDel(K_DIRTY);
  }
  function clearAll() {
    lsDel(K_DOC); lsDel(K_DIRTY); lsDel(K_USER); ssDel(K_TOKEN);
    doc = emptyDoc(); dirty = false; user = null; token = null; tokenExp = 0;
  }

  // ---------- Google sign-in (GIS token model) ----------
  var gisP = null, tokenClient = null, tokenP = null, tokenWait = null;

  function loadGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisP) return gisP;
    gisP = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = GIS_SRC; s.async = true;
      s.onload = function () {
        if (window.google && google.accounts && google.accounts.oauth2) resolve();
        else { gisP = null; reject(fail("gis", "Google sign-in didn't load.")); }
      };
      s.onerror = function () { gisP = null; reject(fail("gis", "Couldn't load Google sign-in. Check your connection.")); };
      document.head.appendChild(s);
    });
    return gisP;
  }

  function getTokenClient() {
    if (tokenClient) return tokenClient;
    if (!(window.google && google.accounts && google.accounts.oauth2)) return null;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: onToken,
      error_callback: onTokenError
    });
    return tokenClient;
  }

  function onToken(resp) {
    var w = tokenWait; tokenWait = null;
    if (!w) return;
    if (!resp || resp.error) {
      w.reject(resp && resp.error === "access_denied"
        ? fail("cancelled", "Sign-in was cancelled.")
        : fail("auth", "Google sign-in failed" + (resp && resp.error ? " (" + resp.error + ")." : ".")));
      return;
    }
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) {
      w.reject(fail("scope", "Google Drive access wasn't allowed, so your lists can't be saved. Sign in again and keep the Drive box ticked."));
      return;
    }
    token = resp.access_token;
    tokenExp = now() + (Number(resp.expires_in) || 3600) * 1000;
    ssSet(K_TOKEN, JSON.stringify({ t: token, exp: tokenExp }));
    w.resolve();
  }

  function onTokenError(err) {
    var w = tokenWait; tokenWait = null;
    if (!w) return;
    var type = err && err.type;
    if (type === "popup_closed") w.reject(fail("cancelled", "Sign-in was cancelled."));
    else if (type === "popup_failed_to_open") {
      w.reject(fail("popup", "Couldn't open the Google sign-in window. Allow pop-ups for this site. " +
                             "In an app's built-in browser, open the site in Chrome or Safari instead."));
    } else w.reject(fail("auth", "Google sign-in failed."));
  }

  // Opens Google's popup. Call this straight from a click handler, otherwise
  // the browser may block the popup.
  function requestToken(prompt) {
    if (tokenP) return tokenP;
    var client = getTokenClient();
    if (!client) return loadGIS().then(function () { return requestToken(prompt); });
    tokenP = new Promise(function (resolve, reject) {
      tokenWait = { resolve: resolve, reject: reject };
      var opts = { prompt: prompt };
      if (user && user.email) opts.login_hint = user.email;
      try { client.requestAccessToken(opts); }
      catch (e) { tokenWait = null; reject(fail("auth", "Google sign-in failed.")); }
    });
    var p = tokenP;
    p.then(function () { tokenP = null; }, function () { tokenP = null; });
    return p;
  }

  function tokenValid() { return !!token && tokenExp - now() > TOKEN_MARGIN; }
  function dropToken() { token = null; tokenExp = 0; ssDel(K_TOKEN); }

  // ---------- Drive API ----------
  function drive(method, path, body, contentType) {
    if (!token) return Promise.reject(fail(401));
    var headers = { Authorization: "Bearer " + token };
    if (contentType) headers["Content-Type"] = contentType;
    return fetch(API + path, { method: method, headers: headers, body: body }).then(function (r) {
      if (r.status === 401) { dropToken(); throw fail(401, "Your Google sign-in expired."); }
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = "";
          try { msg = JSON.parse(t).error.message; } catch (e) {}
          throw fail(r.status, msg || ("Google Drive error " + r.status));
        });
      }
      return r;
    });
  }

  function findFiles() {
    var q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
    return drive("GET", "/drive/v3/files?spaces=appDataFolder&pageSize=10&fields=files(id)&q=" + q)
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.files) || []; });
  }

  function readFile(id) {
    return drive("GET", "/drive/v3/files/" + encodeURIComponent(id) + "?alt=media")
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var raw;
        try { raw = JSON.parse(t); } catch (e) { throw fail("unreadable"); }
        return validateDoc(raw);
      });
  }

  function createFile(d) {
    var b = "dl" + Math.random().toString(36).slice(2);
    var meta = { name: FILE_NAME, parents: ["appDataFolder"], mimeType: "application/json" };
    var body =
      "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n" +
      "--" + b + "\r\nContent-Type: application/json\r\n\r\n" + JSON.stringify(d) + "\r\n" +
      "--" + b + "--";
    return drive("POST", "/upload/drive/v3/files?uploadType=multipart&fields=id", body,
                 "multipart/related; boundary=" + b);
  }

  function updateFile(id, d) {
    return drive("PATCH", "/upload/drive/v3/files/" + encodeURIComponent(id) + "?uploadType=media",
                 JSON.stringify(d), "application/json");
  }

  function deleteFile(id) {
    return drive("DELETE", "/drive/v3/files/" + encodeURIComponent(id));
  }

  function fetchUser() {
    return drive("GET", "/drive/v3/about?fields=" + encodeURIComponent("user(displayName,emailAddress)"))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var u = (j && j.user) || {};
        return { name: String(u.displayName || "").slice(0, 80), email: String(u.emailAddress || "").slice(0, 120) };
      });
  }

  // ---------- Sync ----------
  // Read Drive, then:
  // - no local changes: take Drive's copy as is (it's the newest);
  // - local changes: merge them in and write the result back.
  // Never writes over a file it couldn't read. Only one sync runs at a time.
  function sync() {
    if (!user) return Promise.resolve();
    if (!tokenValid()) {
      setState(dirty ? "unsynced" : "stale");
      return Promise.resolve();
    }
    if (syncP) { syncAgain = true; return syncP; }
    var rev0 = rev, wasDirty = dirty;
    setState("syncing");

    syncP = findFiles().then(function (files) {
      return Promise.all(files.map(function (f) { return readFile(f.id); })).then(function (docs) {
        var remote = null;
        for (var i = 0; i < docs.length; i++) remote = remote ? merge(remote, docs[i]) : docs[i];
        if (!wasDirty) {
          // Nothing to upload. Adopt Drive's copy, plus anything toggled meanwhile.
          var fresh = remote || emptyDoc();
          doc = rev === rev0 ? fresh : merge(fresh, doc);
          return null;
        }
        var out = merge(remote || emptyDoc(), doc);
        out.updated_at = new Date().toISOString();
        var write = files.length ? updateFile(files[0].id, out) : createFile(out);
        return write.then(function () {
          // Two files can appear if two devices created one at the same time.
          // Their contents are merged into the first, so remove the rest.
          return Promise.all(files.slice(1).map(function (f) {
            return deleteFile(f.id).catch(function () {});
          }));
        }).then(function () {
          doc = rev === rev0 ? out : merge(out, doc);
          if (rev === rev0) dirty = false;
        });
      });
    }).then(function () {
      persist();
      emit({ lists: true });
      setState(dirty ? "unsynced" : "synced");
    }, function (e) {
      persist();
      if (e.code === 401) {
        setState(dirty ? "unsynced" : "stale", "Your Google sign-in expired. Tap Sync now.");
      } else if (e.code === "unreadable") {
        setState("error", "Your saved list in Google Drive couldn't be read, so it wasn't changed. " +
                          "You can export the copy on this device.");
      } else if (e.code === 429 || e.code >= 500) {
        setState("unsynced", "Google Drive is busy. Tap Sync now to try again.");
      } else if (typeof e.code === "number") {
        setState("error", "Google Drive error: " + e.message);
      } else {
        setState(dirty ? "unsynced" : "stale", "You seem to be offline. Changes will sync when you're back online.");
      }
    }).then(function () {
      syncP = null;
      if (syncAgain || (dirty && rev !== rev0 && tokenValid())) { syncAgain = false; return sync(); }
    });
    return syncP;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = null; sync(); }, SAVE_DELAY);
  }

  // After a local change: save soon. If the token has expired, get a new one
  // now, while we're still inside the user's tap.
  function kick() {
    if (!user) return;
    if (tokenValid()) { scheduleSave(); return; }
    setState("unsynced");
    requestToken("").then(scheduleSave, function (e) {
      setState("unsynced", e.code === "cancelled" ? "Not saved to Google Drive yet. Tap Sync now." : e.message);
    });
  }

  // ---------- Public API ----------
  function has(list, id) { return !!(doc[list] && own(doc[list], id)); }

  function qty(id) { return own(doc.collection, id) ? cleanQty(doc.collection[id].q) : 0; }

  // on: put the car in the list (q = copies, collection only); off: remove it.
  function setEntry(list, car, on, q) {
    var id = String(car.id || "");
    if (!ID_RE.test(id) || LISTS.indexOf(list) === -1) return;
    var t = stamp();
    if (on) {
      var wasOwned = list === "collection" && own(doc.collection, id);
      doc[list][id] = { y: String(car.y), a: String(car.a), t: String(car.t || "").slice(0, 200), at: t };
      if (list === "collection") doc[list][id].q = cleanQty(q);
      delete doc.removed[list][id];
      // Getting a car you wanted takes it off the wishlist.
      if (list === "collection" && !wasOwned && own(doc.wishlist, id)) {
        delete doc.wishlist[id];
        doc.removed.wishlist[id] = t;
      }
    } else {
      delete doc[list][id];
      doc.removed[list][id] = t;
    }
    dirty = true; rev++;
    persist();
    emit({ lists: true });
  }

  // car: { id, y (year), a (collection key), t (title) }. Call from a click.
  // Signed out: signs in first, then adds the car.
  function toggle(list, car) {
    if (!YEAR_RE.test(String(car.y)) || !KEY_RE.test(String(car.a))) return Promise.resolve(false);
    if (!user) {
      return signIn().then(function () { setEntry(list, car, true); kick(); return true; });
    }
    var on = !has(list, car.id);
    setEntry(list, car, on);
    kick();
    return Promise.resolve(on);
  }

  // Owned copies +delta (the "−  n  +" control). 0 removes the car from the
  // collection. Call from a click. Signed out: signs in first, then makes
  // sure the car is owned (without adding a second copy if it already was).
  // Resolves with the new number of copies.
  function step(car, delta) {
    if (!ID_RE.test(String(car.id || "")) || !YEAR_RE.test(String(car.y)) || !KEY_RE.test(String(car.a))) {
      return Promise.resolve(0);
    }
    if (!user) {
      if (delta <= 0) return Promise.resolve(0);
      return signIn().then(function () {
        if (!qty(car.id)) { setEntry("collection", car, true, 1); kick(); }
        return qty(car.id);
      });
    }
    var cur = qty(car.id);
    var n = Math.max(0, Math.min(MAX_QTY, cur + delta));
    if (n === cur) return Promise.resolve(cur);
    setEntry("collection", car, n > 0, n);
    kick();
    return Promise.resolve(n);
  }

  function signIn() {
    return requestToken(user ? "" : "select_account")
      .then(fetchUser)
      .then(function (u) {
        // A different account than the cached one: start from its own data.
        if (user && u.email && user.email !== u.email) { doc = emptyDoc(); dirty = false; }
        user = u;
        lsSet(K_USER, JSON.stringify(u));
        persist();
        emit({ lists: true });
        return sync();
      });
  }

  function signOut() {
    clearTimeout(saveTimer);
    var t = token;
    if (t && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(t, function () {}); } catch (e) {}
    }
    clearAll();
    emit({ lists: true });
    setState("signed-out");
  }

  // "Sync now" button. Call from a click.
  function syncNow() {
    if (!user) return Promise.resolve();
    if (tokenValid()) return sync();
    return requestToken("").then(sync, function (e) { setState(dirty ? "unsynced" : "stale", e.message); });
  }

  // Delete the Drive file and the copy on this device. Stays signed in.
  function deleteAll() {
    if (!user) return Promise.resolve();
    var go = function () {
      return findFiles().then(function (files) {
        return Promise.all(files.map(function (f) { return deleteFile(f.id); }));
      }).then(function () {
        clearTimeout(saveTimer);
        doc = emptyDoc(); dirty = false; rev++;
        persist();
        emit({ lists: true });
        setState("synced");
      });
    };
    return (tokenValid() ? go() : requestToken("").then(go)).catch(function (e) {
      setState("error", "Couldn't delete your data: " + e.message);
      throw e;
    });
  }

  function entries(list) {
    var out = [], src = doc[list] || {};
    for (var id in src) {
      if (!own(src, id)) continue;
      var e = src[id];
      out.push({ id: id, y: e.y, a: e.a, t: e.t, at: e.at, q: list === "collection" ? cleanQty(e.q) : 0 });
    }
    out.sort(function (p, q) { return (q.y > p.y ? 1 : q.y < p.y ? -1 : 0) || q.at - p.at; });
    return out;
  }

  function exportJSON() {
    return new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  }

  var started = false;
  function init() {
    if (started) return;
    started = true;
    loadCache();
    if (!user) { clearAll(); setState("signed-out"); return; }
    loadGIS().catch(function () {});
    if (tokenValid()) sync();
    else setState(dirty ? "unsynced" : "stale");
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && user && tokenValid()) sync();
    });
    window.addEventListener("online", function () {
      if (user && dirty && tokenValid()) sync();
    });
  }

  window.DiecastLists = {
    init: init,
    // Start loading Google's script early (e.g. when the detail view opens), so
    // a later tap can open the sign-in popup without the browser blocking it.
    prepare: function () { loadGIS().catch(function () {}); },
    has: has,
    qty: qty,
    step: step,
    toggle: toggle,
    entries: entries,
    counts: function () { return { collection: countOf(doc, "collection"), wishlist: countOf(doc, "wishlist") }; },
    signIn: signIn,
    signOut: signOut,
    syncNow: syncNow,
    deleteAll: deleteAll,
    exportJSON: exportJSON,
    user: function () { return user ? { name: user.name, email: user.email } : null; },
    state: function () { return state; },
    message: function () { return message; },
    hasUnsaved: function () { return dirty; },
    on: function (ev, fn) { if (ev === "change" && typeof fn === "function") listeners.push(fn); }
  };
})();
