# Skyrim Assist

A small local web app for Skyrim with three pages:

- **Alchemy**: upload screenshots of your ingredient inventory and get the most profitable order to brew potions and poisons.
- **Skill Training**: how to level each of the 18 skills, from normal play to optimised grinds and known exploits, plus general tips (Standing Stones, sleep bonuses, trainers) and an XP multiplier calculator.
- **Enchanting**: a checklist of learned enchantments filled from screenshots of the enchanting menu, a calculator for how strong each enchantment will be with your skill, perks, soul gem and potions, and a guide to every Fortify Enchanting boost.

## Start

Double-click **`Start Alchemy Assist.command`**. It starts a local server and opens <http://localhost:8765/> in your browser.

- First launch compiles a small OCR helper with Apple's Vision framework (needs Xcode Command Line Tools: `xcode-select --install`). Without it the app falls back to in-browser OCR (Tesseract.js from a CDN), which is slower and less accurate.
- To use it from another device on your network (e.g. your gaming PC), run `python3 server.py --lan` and open the printed network address.
- If macOS blocks the file the first time, right-click it → **Open**.

## Use the Alchemy page

1. Open your inventory → Ingredients in Skyrim, take screenshots (scroll to get every row). SkyUI and vanilla lists both work, full-window or cropped.
2. Drop them on the page, choose them, or paste (⌘V). Add more any time — rows already seen are merged, and changed counts (e.g. Wheat 10 → 5) are updated.
3. Set your Alchemy skill, perks and Fortify Alchemy gear under **Character** — values follow the game's formulas.
4. Brew in the order shown and tick each row once brewed. Its ingredients are deducted; empty ones are greyed out and struck through. Undo from the **Brewed** log.
5. 🔒 keeps an ingredient out of the plan (e.g. quest items). Click a count to correct it.

**Clear ingredients & start fresh** wipes the satchel and log (settings stay). **Shut down server** stops the local server.

## Skill Training page

Open **Skill Training** in the header. Click a skill to see its methods, filter by group (Warrior/Thief/Mage) or by type (Legit/Optimised/Exploit), or search. Methods marked *Patched* don't work if you use the Unofficial Skyrim Special Edition Patch. Link to a skill directly with `skills.html#alchemy`.

## Enchanting page

- **Checklist**: at an arcane enchanter, open the enchantment list, take screenshots while scrolling and drop them on the page. Learned enchantments are ticked; missing ones show which items to disenchant. Click any card to fix it by hand.
- **Power calculator**: set your skill, perks, soul gem and Fortify Enchanting potion (or estimate the potion from your Alchemy setup) to see every enchantment's strength, plus approximate weapon charges.
- **Boost guide**: every source of extra enchantment power and how to get it.
- The switches at the top hide DLC or Anniversary Edition Creation Club content you don't have. The Unofficial Patch switch changes how Fortify Enchanting potions are calculated, because the patch fixes how they work.

## Files

- `server.py` — Python 3 standard-library server (static files, `/api/ocr`, `/api/state`, `/api/shutdown`). State is saved in `data/` (`state.json` for Alchemy, `<page>.json` for other pages).
- `ocr/ocr.swift` — Vision OCR helper (compiled automatically to `ocr/ocr-bin`).
- `public/` — the web app. `alchemy.js` holds the potion maths and optimizer; `data.js` is generated; `skills.html` + `skills.js` are the skill guide (content lives in `skills.js`); `enchanting.html` + `enchanting.js` are the enchanting page and `enchant-data.js` is generated; `ocr.js` is the shared screenshot reader.
- `tools/build_enchant_data.py` — regenerates `public/enchant-data.js` from UESP's *Skyrim:Enchanting Effects* page.
- `tools/build_data.py` — regenerates `public/data.js` from UESP's *Skyrim:Alchemy Effects* page (base game, Dawnguard, Dragonborn, Hearthfire and Creation Club ingredients).

Prices shown are the potion's base value; merchants pay less depending on Speech and perks.
