/*
 * Minimal in-browser PaddleOCR (PP-OCR) pipeline on ONNX Runtime Web.
 *
 *   detection  (DB model)   → finds text lines in the image
 *   recognition (CRNN/SVTR) → reads each line (CTC decoding)
 *
 * No OpenCV: boxes are connected components of the detection map, turned to
 * follow each line's angle, which is enough for card text held roughly level.
 *
 * Usage:
 *   var engine = await PaddleOCRLite.load({ ort, detUrl, recUrl, dictUrl,
 *     det: { thresh, boxThresh, unclip, maxSide },   // optional
 *     charset: /^[ -~]$/ });                        // optional output filter
 *   var lines = await engine.recognize(canvas, onProgress); // [{ text, score, box }]
 *   // PaddleOCRLite.fetchBuf(url, onBytes, sizeHint) downloads with progress;
 *   // pass the buffers as detBuf/recBuf instead of detUrl/recUrl.
 *
 * Models (Apache-2.0, PaddleOCR via RapidOCR's ONNX conversions) live in
 * ./models/. See models/README.md.
 */
(function (root) {
  "use strict";

  // Detection post-processing defaults; each model family ships its own
  // values in inference.yml (PostProcess), so load() accepts overrides.
  var DET_DEFAULTS = {
    maxSide: 960,   // PaddleOCR default limit_side_len
    thresh: 0.3,    // pixel probability threshold
    boxThresh: 0.5, // mean probability required inside a box
    unclip: 1.6     // how much to grow each detected box
  };
  var REC_H = 48;   // recognition input height (PP-OCRv3 to v6)
  var REC_MAX_W = 1280;

  // Fetch a file as an ArrayBuffer, reporting progress as it streams in:
  // onBytes(received, total, done). `total` comes from Content-Length when the
  // response isn't compressed, otherwise from `sizeHint` (the uncompressed
  // size, since the stream yields decompressed bytes).
  function fetchBuf(url, onBytes, sizeHint) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
      var enc = r.headers.get("content-encoding");
      var len = (!enc || enc === "identity") ? parseInt(r.headers.get("content-length"), 10) : NaN;
      var total = len > 0 ? len : (sizeHint || 0);
      if (!onBytes || !r.body || !r.body.getReader) {
        return r.arrayBuffer().then(function (b) {
          if (onBytes) onBytes(b.byteLength, b.byteLength, true);
          return b;
        });
      }
      var reader = r.body.getReader(), chunks = [], got = 0;
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) {
            var out = new Uint8Array(got), o = 0;
            for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
            onBytes(got, got, true);
            return out.buffer;
          }
          chunks.push(res.value);
          got += res.value.length;
          onBytes(got, Math.max(total, got), false);
          return pump();
        });
      }
      return pump();
    });
  }

  // Canvas region → Float32 CHW tensor data in BGR order (what PaddleOCR
  // models were trained on), normalised with per-channel mean/std.
  function toTensorData(ctx, w, h, mean, std) {
    var px = ctx.getImageData(0, 0, w, h).data;
    var n = w * h, out = new Float32Array(3 * n);
    for (var i = 0; i < n; i++) {
      var r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      out[i] = (b - mean[0]) / std[0];
      out[n + i] = (g - mean[1]) / std[1];
      out[2 * n + i] = (r - mean[2]) / std[2];
    }
    return out;
  }

  // Inference runs on the main thread, so give the browser a frame to paint
  // (progress bar, captured photo) between the heavy steps.
  function nextFrame() {
    return new Promise(function (resolve) {
      if (root.requestAnimationFrame) root.requestAnimationFrame(function () { setTimeout(resolve, 0); });
      else setTimeout(resolve, 16);
    });
  }

  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // ---- Detection ----
  function detect(engine, src) {
    var W = src.width, H = src.height, cfg = engine.detCfg;
    var s = Math.min(1, cfg.maxSide / Math.max(W, H));
    var dw = Math.max(32, Math.round(W * s / 32) * 32);
    var dh = Math.max(32, Math.round(H * s / 32) * 32);
    var c = makeCanvas(dw, dh), g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, dw, dh);
    var data = toTensorData(g, dw, dh, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]);
    var feeds = {};
    feeds[engine.det.inputNames[0]] = new engine.ort.Tensor("float32", data, [1, 3, dh, dw]);
    return engine.det.run(feeds).then(function (out) {
      var map = out[engine.det.outputNames[0]].data; // [1,1,dh,dw]
      return boxesFromMap(map, dw, dh, W / dw, H / dh, W, H, cfg);
    });
  }

  // Connected components (4-neighbour) of the thresholded probability map.
  // Each component becomes a rotated box: its angle is the principal axis of
  // the component's pixels, so slightly tilted lines are straightened before
  // reading instead of being clipped by an upright rectangle.
  // Box: { cx, cy, w (along the line), h (across), angle (radians), score },
  // all in source-image pixels.
  function boxesFromMap(map, w, h, sx, sy, W, H, cfg) {
    var N = w * h, seen = new Uint8Array(N), stack = new Int32Array(N), members = new Int32Array(N);
    var boxes = [], TH = cfg.thresh;
    for (var start = 0; start < N; start++) {
      if (seen[start] || map[start] < TH) continue;
      var top = 0, cnt = 0, sum = 0, mx = 0, my = 0;
      stack[top++] = start; seen[start] = 1;
      while (top) {
        var p = stack[--top], x = p % w, y = (p / w) | 0;
        members[cnt++] = p; sum += map[p];
        mx += x * sx; my += y * sy;
        if (x > 0 && !seen[p - 1] && map[p - 1] >= TH) { seen[p - 1] = 1; stack[top++] = p - 1; }
        if (x < w - 1 && !seen[p + 1] && map[p + 1] >= TH) { seen[p + 1] = 1; stack[top++] = p + 1; }
        if (y > 0 && !seen[p - w] && map[p - w] >= TH) { seen[p - w] = 1; stack[top++] = p - w; }
        if (y < h - 1 && !seen[p + w] && map[p + w] >= TH) { seen[p + w] = 1; stack[top++] = p + w; }
      }
      if (cnt < 12 || sum / cnt < cfg.boxThresh) continue;
      mx /= cnt; my /= cnt;
      // Principal axis from the pixel covariance (source-image coordinates).
      var cxx = 0, cyy = 0, cxy = 0, i, px, py;
      for (i = 0; i < cnt; i++) {
        px = (members[i] % w) * sx - mx; py = ((members[i] / w) | 0) * sy - my;
        cxx += px * px; cyy += py * py; cxy += px * py;
      }
      var ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      var ca = Math.cos(ang), sa = Math.sin(ang);
      var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (i = 0; i < cnt; i++) {
        px = (members[i] % w) * sx - mx; py = ((members[i] / w) | 0) * sy - my;
        var u = px * ca + py * sa, v = -px * sa + py * ca;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      // Each map pixel covers sx × sy source pixels.
      var bw = u1 - u0 + sx, bh = v1 - v0 + sy;
      if (bw < 4 * sx || bh < 3 * sy) continue;
      // DB "unclip": grow the shrunk text kernel back to the full line.
      var d = (bw * bh * cfg.unclip) / (2 * (bw + bh));
      var uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
      boxes.push({
        cx: mx + uc * ca - vc * sa, cy: my + uc * sa + vc * ca,
        w: bw + 2 * d, h: bh + 2 * d, angle: ang, score: sum / cnt
      });
    }
    // Reading order: top to bottom, then left to right.
    boxes.sort(function (a, b) {
      return Math.abs(a.cy - b.cy) < Math.min(a.h, b.h) / 2 ? a.cx - b.cx : a.cy - b.cy;
    });
    return boxes;
  }

  // ---- Recognition ----
  function recognizeBox(engine, src, box) {
    var rw = Math.min(REC_MAX_W, Math.max(REC_H, Math.round(REC_H * box.w / box.h)));
    var c = makeCanvas(rw, REC_H), g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, rw, REC_H);
    // Map the rotated box onto the level REC_H-tall input.
    g.translate(rw / 2, REC_H / 2);
    g.scale(rw / box.w, REC_H / box.h);
    g.rotate(-box.angle);
    g.drawImage(src, -box.cx, -box.cy);
    var data = toTensorData(g, rw, REC_H, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    var feeds = {};
    feeds[engine.rec.inputNames[0]] = new engine.ort.Tensor("float32", data, [1, 3, REC_H, rw]);
    return engine.rec.run(feeds).then(function (out) {
      var t = out[engine.rec.outputNames[0]]; // [1, T, C] softmax
      return ctcDecode(t.data, t.dims[1], t.dims[2], engine.chars, engine.allowed);
    });
  }

  // Greedy CTC: best allowed class per step, drop blanks (0) and repeats.
  // `allowed` lists the class ids that may be emitted (blank included), so a
  // multilingual model can be limited to the characters we expect.
  function ctcDecode(p, T, C, chars, allowed) {
    var text = "", sum = 0, n = 0, prev = -1;
    for (var t = 0; t < T; t++) {
      var best = 0, bp = -1, o = t * C;
      if (allowed) {
        for (var a = 0; a < allowed.length; a++) {
          var ci = allowed[a];
          if (p[o + ci] > bp) { bp = p[o + ci]; best = ci; }
        }
      } else {
        for (var c = 0; c < C; c++) if (p[o + c] > bp) { bp = p[o + c]; best = c; }
      }
      if (best !== 0 && best !== prev) {
        text += chars[best - 1] != null ? chars[best - 1] : "";
        sum += bp; n++;
      }
      prev = best;
    }
    return { text: text.trim(), score: n ? sum / n : 0 };
  }

  // Models can be given as URLs (detUrl/recUrl) or already-downloaded
  // buffers (detBuf/recBuf), so the caller can show download progress.
  function load(opts) {
    var ort = opts.ort;
    var so = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    function model(buf, url) {
      return (buf ? Promise.resolve(buf) : fetchBuf(url))
        .then(function (b) { return ort.InferenceSession.create(b, so); });
    }
    return Promise.all([
      model(opts.detBuf, opts.detUrl),
      model(opts.recBuf, opts.recUrl),
      fetch(opts.dictUrl).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " for " + opts.dictUrl);
        return r.text();
      })
    ]).then(function (res) {
      var chars = res[2].replace(/\r/g, "").split("\n");
      if (chars[chars.length - 1] === "") chars.pop();
      chars.push(" "); // PP-OCR models append the space class last
      var detCfg = {}, k;
      for (k in DET_DEFAULTS) detCfg[k] = DET_DEFAULTS[k];
      for (k in (opts.det || {})) detCfg[k] = opts.det[k];
      // opts.charset (RegExp): only these characters may be emitted.
      var allowed = null;
      if (opts.charset) {
        allowed = [0];
        for (var ci = 0; ci < chars.length; ci++) if (opts.charset.test(chars[ci])) allowed.push(ci + 1);
      }
      var engine = { ort: ort, det: res[0], rec: res[1], chars: chars, detCfg: detCfg, allowed: allowed };
      // onProgress(fraction 0..1): detection counts as the first 30%, then
      // each text line read adds its share of the rest.
      engine.recognize = function (src, onProgress) {
        function report(f) { if (onProgress) { try { onProgress(f); } catch (e) {} } }
        report(0);
        return nextFrame().then(function () { return detect(engine, src); }).then(function (boxes) {
          var out = [];
          // Skip vertical strips (side-printed text) and run lines one by one
          // to keep peak memory low on phones.
          var todo = boxes.filter(function (b) {
            return !(Math.abs(b.angle) > Math.PI / 4 || b.h > b.w * 1.5);
          });
          report(0.3);
          var chain = nextFrame();
          todo.forEach(function (b, i) {
            chain = chain.then(function () { return recognizeBox(engine, src, b); })
              .then(function (r) {
                if (r.text) out.push({ text: r.text, score: r.score, box: b });
                report(0.3 + 0.7 * (i + 1) / todo.length);
                return nextFrame();
              });
          });
          return chain.then(function () { report(1); return out; });
        });
      };
      return engine;
    });
  }

  root.PaddleOCRLite = { load: load, fetchBuf: fetchBuf };
})(window);
