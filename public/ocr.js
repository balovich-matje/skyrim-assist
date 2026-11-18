/* Shared screenshot text recognition: macOS Vision via server.py, else Tesseract.js in the browser.
   SkyOCR.init() -> {server, engine}; SkyOCR.run(file) -> [{text}] */
(function () {
  "use strict";
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const st = { server: false, engine: "tesseract", ready: null };
  let worker = null;

  function init() {
    if (!st.ready) {
      st.ready = fetch("/api/health", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => { st.server = true; st.engine = j.ocr === "vision" ? "vision" : "tesseract"; })
        .catch(() => { st.server = false; st.engine = "tesseract"; })
        .then(() => st);
    }
    return st.ready;
  }

  async function viaServer(file) {
    const r = await fetch("/api/ocr", { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "OCR failed");
    return j.lines;
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("could not load " + src)); document.head.appendChild(s); });
  }

  async function viaBrowser(file) {
    if (!window.Tesseract) await loadScript(TESSERACT_URL);
    if (!worker) worker = await window.Tesseract.createWorker("eng");
    const bmp = await createImageBitmap(file);
    const scale = Math.min(3, Math.max(1, 2400 / bmp.width));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0, c.width, c.height);
    // light text on a dark background -> dark text on white
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] > 150 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    const { data } = await worker.recognize(c);
    return (data.lines || []).map((l) => ({ text: l.text }));
  }

  async function run(file) {
    await init();
    if (st.engine === "vision") {
      try { return await viaServer(file); } catch (e) { if (!/unavailable/.test(e.message)) throw e; st.engine = "tesseract"; }
    }
    return viaBrowser(file);
  }

  // Levenshtein distance, shared by pages that fuzzy-match names.
  function lev(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j), cur = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[b.length];
  }

  window.SkyOCR = { init, run, lev, state: st };
})();
