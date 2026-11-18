/* Skyrim Assist — Enchanting: checklist, power calculator, boost guide */
(function () {
  "use strict";
  const ALL = window.ENCHANT_DATA;
  const A = window.Alchemy;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LS_KEY = "enchanting-state";

  const GROUP_LABEL = {
    "Fortify Skill": "Fortify skills", "Fortify Attribute": "Health, Magicka & Stamina", "Fortify Other": "Other fortify",
    Resist: "Resistances", Other: "Utility", Absorb: "Absorb", Damage: "Damage", Repel: "Repel", "Apply Effect": "Apply effect", Special: "Special",
  };
  const SOUL = { grand: [1, 3000], greater: [2 / 3, 2000], common: [1 / 3, 1000], lesser: [1 / 6, 500], petty: [1 / 12, 250] };
  const SLOT = { head: "Head", neck: "Neck", chest: "Chest", hands: "Hands", finger: "Ring", feet: "Feet", shield: "Shield" };

  // ---------------------------------------------------------------- state
  let state = {
    learned: {},                 // name -> "ocr" | "manual"
    opts: { dlc: true, cc: true, ussep: true },
    tab: "checklist",
    cl: { status: "all", type: "all" },
    calc: {
      skill: 100, rank: 5, insightful: true, corpus: true, fire: true, frost: true, storm: true,
      augFire: 0, augFrost: 0, augShock: 0, soul: "grand", potion: 0, ahzidal: false, seeker: false, haunt: 0,
      type: "all", onlyLearned: false,
      est: { skill: 100, rank: 5, gear: 0, benefactor: true, shadows: false, curios: false },
    },
  };
  let server = false;

  function merge(dst, src) {
    for (const k of Object.keys(src || {})) {
      if (dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k]) && k !== "learned") merge(dst[k], src[k]);
      else dst[k] = src[k];
    }
    return dst;
  }

  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const body = JSON.stringify(state);
      try { localStorage.setItem(LS_KEY, body); } catch (e) { /* storage unavailable */ }
      if (server) fetch("/api/state/enchanting", { method: "PUT", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
    }, 250);
  }

  async function load() {
    const o = await window.SkyOCR.init();
    server = o.server;
    let saved = null;
    if (server) {
      try { const r = await fetch("/api/state/enchanting"); if (r.ok) saved = await r.json(); } catch (e) { /* ignore */ }
      // older server.py without per-page storage
      if (saved && !saved.learned) saved = null;
    }
    if (!saved) { try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { saved = null; } }
    if (saved) merge(state, saved);
  }

  // ---------------------------------------------------------------- content filters
  const allowedSrc = (src) => src === "base" || (src.startsWith("CC") ? state.opts.cc : state.opts.dlc);
  const visibleEnchants = () => ALL.filter((e) => allowedSrc(e.src));
  const srcBadge = (src) => (src === "base" ? "" : `<span class="srcb ${src.startsWith("CC") ? "cc" : "dlc"}" title="${esc(src)}">${src.startsWith("CC") ? "CC" : esc(src)}</span>`);

  function applyOptsVisibility() {
    document.querySelectorAll("[data-needs]").forEach((n) => { n.hidden = !state.opts[n.dataset.needs]; });
  }

  // ---------------------------------------------------------------- name matching
  const norm = (s) => s.toLowerCase().replace(/[’`´]/g, "'").replace(/[^a-z'& -]+/g, " ").replace(/\s+/g, " ").trim();
  const NAME_INDEX = [];
  ALL.forEach((e) => [e.name, ...(e.aliases || [])].forEach((n) => NAME_INDEX.push({ n: norm(n), name: e.name })));

  function matchEnchant(raw) {
    const t = norm(raw);
    if (t.length < 4) return null;
    let best = null, bestD = Infinity, second = Infinity;
    for (const c of NAME_INDEX) {
      if (Math.abs(c.n.length - t.length) > 4) continue;
      const d = window.SkyOCR.lev(t, c.n);
      if (d < bestD) { if (best !== c.name) second = bestD; bestD = d; best = c.name; }
      else if (d < second && c.name !== best) second = d;
    }
    const tol = t.length <= 8 ? 1 : Math.floor(t.length * 0.12);
    return bestD <= tol && second > bestD ? best : null;
  }

  // ---------------------------------------------------------------- uploads
  let queue = Promise.resolve();
  function handleFiles(files) {
    const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp|gif|heic|tiff?)$/i.test(f.name || ""));
    if (!imgs.length) return toast("Those don't look like images.");
    for (const f of imgs) {
      const card = document.createElement("div");
      card.className = "upload";
      card.innerHTML = `<img alt="" src="${URL.createObjectURL(f)}"><div><div class="u-name">${esc(f.name || "Pasted image")}</div><div class="u-res"><span class="spinner"></span>Reading…</div></div>`;
      const box = $("#uploads");
      box.prepend(card);
      while (box.children.length > 5) box.lastChild.remove();
      queue = queue.then(() => processFile(f, card));
    }
  }

  async function processFile(file, card) {
    const res = card.querySelector(".u-res");
    try {
      const lines = await window.SkyOCR.run(file);
      const found = new Set();
      for (const l of lines) { const n = matchEnchant(l.text || ""); if (n) found.add(n); }
      if (!found.size) { card.classList.add("err"); res.textContent = "No enchantments recognised — is the enchantment list visible?"; return; }
      const fresh = [...found].filter((n) => !state.learned[n]);
      fresh.forEach((n) => { state.learned[n] = "ocr"; });
      res.innerHTML = `${found.size} found${fresh.length ? ` · <span class="new">${fresh.length} new</span>` : " · nothing new"}`;
      res.title = [...found].join("\n");
      save();
      renderChecklist(fresh);
    } catch (e) {
      card.classList.add("err");
      res.textContent = "Failed: " + e.message;
    }
  }

  // ---------------------------------------------------------------- checklist
  function chips(box, items, cur, onPick) {
    box.innerHTML = "";
    for (const [v, label] of items) {
      const b = document.createElement("button");
      b.className = "chip-btn"; b.textContent = label; b.type = "button";
      b.setAttribute("aria-pressed", String(cur === v));
      b.onclick = () => onPick(v);
      box.appendChild(b);
    }
  }

  function renderChecklist(flash = []) {
    const list = visibleEnchants();
    const learnedCount = list.filter((e) => state.learned[e.name]).length;
    // progress ring
    const C = 2 * Math.PI * 52;
    const ring = $("#ringFg");
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C * (1 - (list.length ? learnedCount / list.length : 0));
    countTo($("#ringNum"), learnedCount);
    $("#ringOf").textContent = `of ${list.length} learned`;
    $("#segCount").textContent = `${learnedCount}/${list.length}`;

    chips($("#clStatus"), [["all", "All"], ["missing", `Missing (${list.length - learnedCount})`], ["learned", `Learned (${learnedCount})`]], state.cl.status, (v) => { state.cl.status = v; save(); renderChecklist(); });
    chips($("#clType"), [["all", "All types"], ["apparel", "Apparel"], ["weapon", "Weapons"]], state.cl.type, (v) => { state.cl.type = v; save(); renderChecklist(); });

    const q = norm($("#clSearch").value || "");
    const shown = list.filter((e) => (state.cl.type === "all" || e.type === state.cl.type)
      && (state.cl.status === "all" || (state.cl.status === "learned") === !!state.learned[e.name])
      && (!q || norm(e.name + " " + e.fmt).includes(q)));

    const box = $("#checklist");
    box.innerHTML = "";
    if (!shown.length) { box.innerHTML = `<p class="no-results">${state.cl.status === "missing" && !q ? "Nothing missing. Every enchantment learned!" : "No enchantments match."}</p>`; return; }
    let group = null, grid = null, i = 0;
    for (const e of shown) {
      const g = e.type + ":" + e.group;
      if (g !== group) {
        group = g;
        const h = document.createElement("h3");
        h.className = "cl-group";
        h.innerHTML = `<span>${e.type === "weapon" ? "Weapon" : "Apparel"}</span> ${esc(GROUP_LABEL[e.group] || e.group)}`;
        box.appendChild(h);
        grid = document.createElement("div");
        grid.className = "cl-grid";
        box.appendChild(grid);
      }
      const learned = !!state.learned[e.name];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ench-card" + (learned ? " learned" : "") + (flash.includes(e.name) ? " just" : "");
      card.style.setProperty("--d", (flash.includes(e.name) ? flash.indexOf(e.name) * 60 : Math.min(i++ * 12, 300)) + "ms");
      card.setAttribute("aria-pressed", String(learned));
      const srcs = e.sources.filter((s) => allowedSrc(s.src)).slice(0, 3);
      card.innerHTML = `
        <span class="ec-check" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9"/></svg></span>
        <span class="ec-body">
          <span class="ec-name">${esc(e.name)} ${srcBadge(e.src)}</span>
          <span class="ec-fx">${esc(e.fmt.replace("{v}", e.base ?? ""))} <span class="muted">· ${e.type === "weapon" ? esc(e.school) : e.slots.map((s) => SLOT[s]).join(", ")}</span></span>
          ${learned ? "" : `<span class="ec-src">Disenchant: ${srcs.length ? srcs.map((s) => esc(s.text) + (s.src !== "base" ? ` <i>(${esc(s.src.replace("CC: ", ""))})</i>` : "")).join("; ") : "<i>only from content you've turned off</i>"}</span>`}
        </span>`;
      card.title = learned ? "Click to mark as missing" : "Click to mark as learned";
      card.onclick = () => {
        if (state.learned[e.name]) delete state.learned[e.name]; else state.learned[e.name] = "manual";
        save(); renderChecklist(state.learned[e.name] ? [e.name] : []);
        if (!$("#panel-calc").hidden) renderCalc();
      };
      grid.appendChild(card);
    }
  }

  const shownNum = new WeakMap();
  function countTo(node, target) {
    const from = shownNum.get(node) || 0, t0 = performance.now();
    shownNum.set(node, target);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(from + (target - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- calculator
  const skillMult = (s) => 1 + (s / 100) * (s / 100 - 0.14) / 3.4;

  function factors() {
    const c = state.calc, dlc = state.opts.dlc, cc = state.opts.cc;
    const potion = Math.max(0, Number(c.potion) || 0);
    const extraSkill = (dlc && c.ahzidal ? 10 : 0) + (cc ? 10 * Math.max(0, Number(c.haunt) || 0) : 0);
    const effSkill = c.skill + extraSkill + (state.opts.ussep ? 0 : potion);
    return {
      effSkill,
      skill: skillMult(effSkill),
      potion: state.opts.ussep ? 1 + potion / 100 : 1,
      ench: 1 + 0.2 * c.rank,
      seeker: dlc && c.seeker ? 1.1 : 1,
      soul: SOUL[c.soul][0],
      cap: SOUL[c.soul][1],
      chargeSkill: Math.min(199, c.skill + extraSkill),
    };
  }

  function strength(e, f) {
    if (e.base == null) return null;
    const c = state.calc;
    const owned = (e.perks || []).filter((p) => c[p]).length;
    const spec = 1 + 0.25 * owned;
    const core = e.base * f.skill * f.potion * f.ench * spec * f.seeker;
    if (e.type === "apparel") return { v: Math.floor(core * f.soul + 1e-9), spec };
    const aug = { fire: c.augFire, frost: c.augFrost, shock: c.augShock };
    const augMult = 1 + (e.elem || []).reduce((s, el) => s + 0.25 * (Number(aug[el]) || 0), 0);
    const v = Math.floor(Math.floor(core + 1e-9) * augMult + 1e-9);
    const perUse = 3 * Math.pow(e.cost, 1.1) * (1 - Math.sqrt(f.chargeSkill / 200));
    return { v, spec, augMult, uses: perUse > 0 ? Math.floor(f.cap / perUse) : Infinity };
  }

  function renderCalc() {
    const c = state.calc, f = factors();
    $("#skillOut").textContent = c.skill;
    // headline multipliers
    const general = f.skill * f.potion * f.ench * f.seeker;
    const cards = [
      ["Apparel", general * f.soul, `Skill ${Math.round(f.effSkill)} · ${$("#cSoul").selectedOptions[0].textContent.split(" (")[0]} soul`],
      ["Apparel + specialist perk", general * f.soul * 1.25, "Insightful, Corpus or elemental"],
      ["Weapons", general, "Max magnitude; soul gem only changes charges"],
    ];
    $("#multCards").innerHTML = cards.map(([t, m, sub]) => `<div class="mult-card"><span>${t}</span><b>×${m.toFixed(2)}</b><small>${sub}</small></div>`).join("");

    const q = norm($("#cSearch").value || "");
    chips($("#cType"), [["all", "All"], ["apparel", "Apparel"], ["weapon", "Weapons"]], c.type, (v) => { c.type = v; save(); renderCalc(); });
    const rows = visibleEnchants().filter((e) => (c.type === "all" || e.type === c.type) && (!c.onlyLearned || state.learned[e.name]) && (!q || norm(e.name).includes(q)));
    const head = `<div class="ct-row ct-head" role="row"><span role="columnheader">Enchantment</span><span role="columnheader">At your settings</span><span role="columnheader">Base</span><span role="columnheader">Boosted by</span></div>`;
    $("#calcTable").innerHTML = head + (rows.length ? rows.map((e) => {
      const r = strength(e, f);
      const boosts = [];
      (e.perks || []).forEach((p) => boosts.push(`<span class="pk ${c[p] ? "on" : ""}">${{ insightful: "Insightful", corpus: "Corpus", fire: "Fire Ench.", frost: "Frost Ench.", storm: "Storm Ench." }[p]}</span>`));
      if (e.elem) e.elem.forEach((el) => boosts.push(`<span class="pk ${Number(c["aug" + el[0].toUpperCase() + el.slice(1)]) ? "on" : ""}">Augmented ${el[0].toUpperCase() + el.slice(1)}</span>`));
      const val = r ? esc(e.fmt).replace("{v}", `<b class="v">${r.v}</b>`) : `<span class="muted">${esc(e.fmt)}</span>`;
      const extra = e.type === "weapon" && r ? `<small class="uses">≈ ${isFinite(r.uses) ? r.uses : "∞"} hits per ${c.soul} soul</small>` : "";
      return `<div class="ct-row ${e.type}" role="row">
        <span role="cell" class="ct-name">${esc(e.name)} ${srcBadge(e.src)}${state.learned[e.name] ? '<span class="lrn" title="Learned">✓</span>' : ""}</span>
        <span role="cell" class="ct-val">${val}${extra}</span>
        <span role="cell" class="ct-base">${e.base ?? "–"}</span>
        <span role="cell" class="ct-boost">${boosts.join("") || '<span class="muted">general only</span>'}</span>
      </div>`;
    }).join("") : `<p class="no-results">No enchantments match${c.onlyLearned ? " (only learned ones are shown)" : ""}.</p>`);
  }

  function estimatePotion() {
    const s = state.calc.est;
    const fe = A.EFFECTS.find((x) => x.name === "Fortify Enchanting");
    const power = A.basePower({ skill: s.skill, fortify: Number(s.gear) || 0, alchemist: s.rank, seeker: state.opts.dlc && s.shadows })
      * (s.benefactor ? 1.25 : 1);
    return Math.round(fe.mag * (state.opts.cc && s.curios ? 2 : 1) * power);
  }

  function bindCalc() {
    const c = state.calc;
    const map = { cSkill: "skill", cRank: "rank", cInsightful: "insightful", cCorpus: "corpus", cFire: "fire", cFrost: "frost", cStorm: "storm",
      cAugFire: "augFire", cAugFrost: "augFrost", cAugShock: "augShock", cSoul: "soul", cPotion: "potion", cAhzidal: "ahzidal", cSeeker: "seeker", cHaunt: "haunt", cOnlyLearned: "onlyLearned" };
    for (const [id, k] of Object.entries(map)) {
      const inp = $("#" + id);
      if (inp.type === "checkbox") inp.checked = !!c[k]; else inp.value = c[k];
      inp.addEventListener("input", () => {
        c[k] = inp.type === "checkbox" ? inp.checked : (inp.tagName === "SELECT" && k === "soul") ? inp.value : Number(inp.value) || 0;
        save(); renderCalc();
      });
    }
    const est = c.est;
    const emap = { aSkill: "skill", aRank: "rank", aGear: "gear", aBenefactor: "benefactor", aShadows: "shadows", aCurios: "curios" };
    const upd = () => { $("#aSkillOut").textContent = est.skill; $("#estOut").textContent = "+" + estimatePotion() + "%"; };
    for (const [id, k] of Object.entries(emap)) {
      const inp = $("#" + id);
      if (inp.type === "checkbox") inp.checked = !!est[k]; else inp.value = est[k];
      inp.addEventListener("input", () => { est[k] = inp.type === "checkbox" ? inp.checked : Number(inp.value) || 0; save(); upd(); });
    }
    upd();
    $("#useEst").onclick = () => { c.potion = estimatePotion(); $("#cPotion").value = c.potion; save(); renderCalc(); toast(`Potion set to +${c.potion}%`); };
    $("#cSearch").addEventListener("input", renderCalc);
    $("#calcForm").addEventListener("input", () => { $("#estOut").textContent = "+" + estimatePotion() + "%"; });
  }

  // ---------------------------------------------------------------- guide
  const ING = (name, src, note) => ({ name, src, note });
  const POTION_INGS = [ING("Blue Butterfly Wing", "base"), ING("Hagraven Claw", "base"), ING("Snowberries", "base"), ING("Spriggan Sap", "base"),
    ING("Ancestor Moth Wing", "Dawnguard"), ING("Chaurus Hunter Antennae", "Dawnguard"), ING("Spawn Ash", "Dragonborn"),
    ING("Dreugh Wax", "CC: Rare Curios", "2× strength"), ING("Stoneflower Petals", "CC: Rare Curios", "2× strength")];

  function guideItems() {
    const us = state.opts.ussep;
    return [
      { src: "base", title: "Enchanting skill", big: "≈ ×1.25 at 100", html: `<p>Skill adds a curved bonus: almost nothing at 15, about <b>+25%</b> at 100. Bonuses that raise the skill itself, like Ahzidal's Genius and Haunting Gift below, push it past 100.</p>` },
      { src: "base", title: "Enchanter perk", big: "up to ×2", html: `<p>Five ranks, each making new enchantments <b>20% stronger</b>. Ranks unlock at 0, 20, 40, 60 and 80 Enchanting. This is the biggest single boost, so fill it first.</p>` },
      { src: "base", title: "Specialist perks", big: "×1.25 each", html: `<ul><li><b>Insightful Enchanter</b> (50): every Fortify <i>skill</i> enchantment, including robes' skill part.</li>
          <li><b>Corpus Enchanter</b> (70): Fortify Health, Magicka, Stamina and their regen enchantments.</li>
          <li><b>Fire / Frost / Storm Enchanter</b> (30/40/50): elemental weapon damage and the matching resistance on armor. Chaos Damage gets all three.</li></ul>
          <p>On weapons, Destruction's <b>Augmented Flames/Frost/Shock</b> perks add another +25% per rank on top.</p>` },
      { src: "base", title: "Soul gem size", big: "×1 → ×1⁄12", html: `<p>Apparel strength scales with the soul: Grand ×1, Greater ×⅔, Common ×⅓, Lesser ×⅙, Petty ×1⁄12. Black souls count as Grand. Weapon strength doesn't change, only how many hits the charge lasts. On/off effects like Muffle and Waterbreathing only need a Petty soul. <b>Azura's Star</b> is a reusable Grand soul gem.</p>` },
      { src: "base", title: "Fortify Enchanting potions", big: "+15–40%", html: `<p>Brew from ${POTION_INGS.filter((i) => allowedSrc(i.src)).map((i) => `<b>${i.name}</b>${i.src !== "base" ? ` <i>(${i.src.replace("CC: ", "")}${i.note ? ", " + i.note : ""})</i>` : ""}`).join(", ")}. Strength depends on your Alchemy setup. Use the estimator on the Power calculator tab.</p>
          <p>The effect lasts <b>30 real seconds</b>, and the clock keeps running inside the enchanting menu. Do a dry run first to pick the item, soul and enchantment, then drink and enchant. The Slow Time shout buys a few extra seconds.</p>
          <p class="${us ? "" : "warn"}">${us ? "With the Unofficial Patch, the potion multiplies enchantment strength directly: +32% means 32% stronger." : "Without the Unofficial Patch, the potion is added to your Enchanting <i>skill</i> instead, which is much weaker. A +32% potion at 100 skill only gives about +16%. Turn on the USSEP switch above if you use the patch."}</p>` },
      { src: "base", title: "Fortify Alchemy gear loop", big: "repeatable", html: `<ol><li>Wear your best Fortify Alchemy gear (head, hands, ring, necklace) and brew a Fortify Enchanting potion.</li>
          <li>Drink it and enchant a <b>new, stronger</b> set of Fortify Alchemy gear.</li>
          <li>Wear the new set, brew a stronger potion, and repeat until the numbers stop growing (usually 2–3 rounds).</li></ol>
          <p>A Falmer helmet and a circlet can be worn together, giving a fifth Fortify Alchemy slot. This is a long-standing bug that most players accept.</p>` },
      { src: "Dragonborn", title: "Seeker of Sorcery", big: "×1.1", html: `<p>Choose it as the reward from the Black Book <b>The Sallow Regent</b> in White Ridge Barrow on Solstheim. All enchantments become 10% stronger and spells cost 10% less. You can swap it for <b>Seeker of Shadows</b> (+10% potion strength) by reading the book again, so brew your potions under Shadows and enchant under Sorcery.</p>` },
      { src: "Dragonborn", title: "Ahzidal's Genius", big: "+10 skill", html: `<p>Wear <b>exactly four</b> of Ahzidal's relics (any mix of the armor pieces and his two rings) to get +10 Enchanting, which works even above 100. The relics come from the quest <b>Unearthed</b>, given by Ralis Sedarys at Kolbjorn Barrow. Take them off before enchanting the slots they use.</p>` },
      { src: "CC: Rare Curios", title: "Dreugh Wax & Stoneflower Petals", big: "2× potion", html: `<p>These Rare Curios ingredients have a Fortify Enchanting effect twice as strong as normal ingredients, which roughly doubles your best potion. With them, the best patched potion goes from about +44% to over +100% (UESP testing).</p>` },
      { src: "CC: Necromantic Grimoire", title: "Haunting Gift", big: "+10 skill each", html: `<p>Cast <b>Conjure Haunting Spirit</b> (sold by Phinis Gestor at the College once you own the Necromantic Grimoire). When something else kills the spirit, you get <b>+10 to all skills for 60 seconds</b>, and it stacks across spirits. Testing on UESP suggests it doesn't work if you kill the spirit yourself, so let an enemy or follower do it.</p>` },
      { src: "base", exploit: true, title: "Fortify Restoration potions", big: "exploit", html: `<p>Restoration potions also boost the strength of Fortify Alchemy gear and Fortify Enchanting potions. Repeated, this grows without limit (see Alchemy on the Skill Training page).</p>`, patched: us },
      { src: "base", exploit: true, title: "Vampire Necromage", big: "+25%", html: `<p>As a vampire with the Restoration perk Necromage, effects on yourself, including worn enchantments, are 25% stronger. This bug also makes the potion/gear loop grow far higher.</p>`, patched: us },
    ];
  }

  function renderGuide() {
    $("#guide").innerHTML = guideItems().filter((g) => allowedSrc(g.src)).map((g, i) => `
      <li class="g-card ${g.exploit ? "exploit" : ""} ${g.patched ? "is-patched" : ""}" style="--d:${i * 40}ms">
        <div class="g-head"><h3>${esc(g.title)}</h3>${g.big ? `<span class="big">${g.big}</span>` : ""}</div>
        <div class="g-tags">${g.src === "base" ? '<span class="srcb base">Base game</span>' : srcBadge(g.src)}${g.exploit ? '<span class="badge exploit">Exploit</span>' : ""}${g.patched ? '<span class="badge patched">Removed by the Unofficial Patch</span>' : ""}</div>
        ${g.html}
      </li>`).join("");
  }

  // ---------------------------------------------------------------- tabs, toggles, misc
  function setTab(tab, push) {
    state.tab = tab;
    document.querySelectorAll(".seg [data-tab]").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".tabpanel").forEach((p) => {
      const on = p.id === "panel-" + tab;
      if (on && p.hidden) { p.hidden = false; p.classList.remove("enter"); void p.offsetWidth; p.classList.add("enter"); }
      else if (!on) p.hidden = true;
    });
    moveInk();
    if (tab === "calc") renderCalc();
    if (tab === "guide") renderGuide();
    if (push) history.replaceState(null, "", "#" + tab);
    save();
  }
  function moveInk() {
    const b = document.querySelector(`.seg [data-tab="${state.tab}"]`), ink = $(".seg-ink");
    if (!b) return;
    ink.style.width = b.offsetWidth + "px";
    ink.style.transform = `translateX(${b.offsetLeft}px)`;
  }

  function bindToggles() {
    for (const [id, k] of [["optDLC", "dlc"], ["optCC", "cc"], ["optUSSEP", "ussep"]]) {
      const inp = $("#" + id);
      inp.checked = !!state.opts[k];
      inp.addEventListener("change", () => {
        state.opts[k] = inp.checked; save();
        applyOptsVisibility(); renderChecklist(); renderCalc(); renderGuide();
        $("#estOut").textContent = "+" + estimatePotion() + "%";
      });
    }
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function bindChecklist() {
    const dz = $("#dropzone"), fi = $("#fileInput");
    dz.addEventListener("click", () => fi.click());
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } });
    fi.addEventListener("change", () => { handleFiles(fi.files); fi.value = ""; });
    let depth = 0;
    const onChecklist = () => state.tab === "checklist";
    window.addEventListener("dragenter", (e) => { e.preventDefault(); if (!onChecklist()) setTab("checklist", true); depth++; dz.classList.add("drag"); });
    window.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; dz.classList.remove("drag"); } });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => { e.preventDefault(); depth = 0; dz.classList.remove("drag"); if (e.dataTransfer.files.length) { setTab("checklist", true); handleFiles(e.dataTransfer.files); } });
    window.addEventListener("paste", (e) => {
      if (e.target.matches && e.target.matches("input")) return;
      const files = [...((e.clipboardData && e.clipboardData.files) || [])];
      if (files.length) { e.preventDefault(); setTab("checklist", true); handleFiles(files); }
    });
    $("#clSearch").addEventListener("input", () => renderChecklist());
    $("#resetChecklist").addEventListener("click", () => {
      if (!Object.keys(state.learned).length) return;
      if (!confirm("Clear every learned enchantment from the checklist?")) return;
      state.learned = {}; $("#uploads").innerHTML = ""; save(); renderChecklist(); toast("Checklist cleared");
    });
  }

  function bindTabs() {
    document.querySelectorAll(".seg [data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab, true)));
    $(".seg").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const tabs = [...document.querySelectorAll(".seg [data-tab]")];
      const i = tabs.findIndex((t) => t.dataset.tab === state.tab);
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      setTab(n.dataset.tab, true); n.focus();
    });
    window.addEventListener("resize", moveInk);
    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      if (["checklist", "calc", "guide"].includes(h) && h !== state.tab) setTab(h, false);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInk);
  }

  load().then(() => {
    const fromHash = (location.hash || "").slice(1);
    if (["checklist", "calc", "guide"].includes(fromHash)) state.tab = fromHash;
    bindToggles();
    applyOptsVisibility();
    bindChecklist();
    bindCalc();
    bindTabs();
    renderChecklist();
    setTab(state.tab, false);
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("ready")));
  });
})();
