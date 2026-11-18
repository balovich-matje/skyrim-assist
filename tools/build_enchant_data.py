#!/usr/bin/env python3
"""Rebuild public/enchant-data.js from the UESP "Skyrim:Enchanting Effects" page.

Usage:  python3 tools/build_enchant_data.py [path/to/enchanting_effects_raw.txt]
If no path is given the page is downloaded from en.uesp.net.
"""
import json, os, re, sys, urllib.request

URL = "https://en.uesp.net/w/index.php?title=Skyrim:Enchanting_Effects&action=raw"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "enchant-data.js")

SKIP = {"Briarheart Geis"}  # exists in data but can't be obtained in game

# In-game display names (as shown at the arcane enchanter) + aliases the OCR may see.
NAMES = {
    ("Fortify Attribute", "Healing Regen"): ("Fortify Healing Rate", ["Fortify Healing Regen"]),
    ("Fortify Attribute", "Magicka Regen"): ("Fortify Magicka Regen", ["Fortify Magicka Rate"]),
    ("Fortify Attribute", "Stamina Regen"): ("Fortify Stamina Regen", ["Fortify Stamina Rate"]),
    ("Fortify Other", "Unarmed"): ("Fortify Unarmed", ["Fortify Unarmed Damage"]),
    ("Damage", "Chaos"): ("Chaos Damage", []),
    ("Damage", "Magicka"): ("Magicka Damage", ["Damage Magicka"]),
    ("Damage", "Stamina"): ("Stamina Damage", ["Damage Stamina"]),
}

# Friendlier effect wording; {v} is the scaled number.
FMT = {
    "Fortify Lockpicking": "Locks are {v}% easier to pick",
    "Fortify Sneak": "{v}% harder to detect",
    "Fortify Healing Rate": "Health regenerates {v}% faster",
    "Fortify Magicka Regen": "Magicka regenerates {v}% faster",
    "Fortify Stamina Regen": "Stamina regenerates {v}% faster",
    "Fortify Health": "+{v} Health", "Fortify Magicka": "+{v} Magicka", "Fortify Stamina": "+{v} Stamina",
    "Fortify Carry Weight": "+{v} carry weight",
    "Fortify Archery": "+{v}% bow damage", "Fortify One-handed": "+{v}% one-handed damage",
    "Fortify Two-handed": "+{v}% two-handed damage",
    "Fortify Alteration": "−{v}% Alteration spell cost", "Fortify Conjuration": "−{v}% Conjuration spell cost",
    "Fortify Destruction": "−{v}% Destruction spell cost", "Fortify Illusion": "−{v}% Illusion spell cost",
    "Fortify Restoration": "−{v}% Restoration spell cost",
    "Fortify Pickpocket": "+{v}% pickpocket success chance",
    "Resist Fire": "+{v}% fire resistance", "Resist Frost": "+{v}% frost resistance", "Resist Shock": "+{v}% shock resistance",
    "Resist Magic": "+{v}% magic resistance", "Resist Poison": "+{v}% poison resistance", "Resist Disease": "+{v}% disease resistance",
    "Fortify Heavy Armor": "+{v} Heavy Armor skill", "Fortify Light Armor": "+{v} Light Armor skill",
    "Fortify Unarmed": "+{v} unarmed damage",
    "Dark Moon": "+{v} Magicka, −30% Health regen",
    "Empower Necromancy": "+{v}% Conjuration spell duration, +1 lesser undead",
    "Absorb Health": "Absorb {v} Health", "Absorb Magicka": "Absorb {v} Magicka", "Absorb Stamina": "Absorb {v} Stamina",
    "Chaos Damage": "50% chance each of {v} fire, frost and shock damage",
    "Fire Damage": "{v} fire damage", "Frost Damage": "{v} frost damage, 50% slow for 2 s",
    "Shock Damage": "{v} shock damage", "Magicka Damage": "{v} Magicka damage", "Stamina Damage": "{v} Stamina damage",
    "Banish": "Banish summoned Daedra up to level {v}",
    "Fear": "Creatures up to level {v} flee for 30 s",
    "Turn Undead": "Undead up to level {v} flee for 30 s",
    "Paralyze": "26% chance to paralyze for {v} s",
    "Soul Trap": "Soul trap for {v} s",
    "Fiery Soul Trap": "Soul trap for {v} s + 10 fire damage",
    "Huntsman's Prowess": "+{v} damage vs. animals",
    "Silent Moons Enchant": "+{v} damage at night (9pm–5am)",
    "Smithing Expertise": "{v} shock damage, +5 Smithing",
}
BASE_OVERRIDE = {"Paralyze": 2}  # the 26% chance is fixed; only the duration scales


def load():
    if len(sys.argv) > 1:
        return open(sys.argv[1], encoding="utf-8").read()
    req = urllib.request.Request(URL, headers={"User-Agent": "skyrim-assist/1.0"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")


def strip_templates(s):
    for _ in range(4):
        s = re.sub(r"\{\{Ref\|[^{}]*\}\}", "", s)
        s = re.sub(r"\{\{(?:Bug|VN|vn)[^{}]*\}\}", "", s)
    return s


def clean(s):
    s = strip_templates(s)
    s = re.sub(r"\{\{nowrap\|([^}]*)\}\}", r"\1", s)
    s = re.sub(r"\{\{Ref\|.*$", "", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<br\s*/?>|</br>", " / ", s)
    s = re.sub(r"'''?|data-sort-value=\d+\||width=1\|", "", s)
    s = re.sub(r"\{\{(DB|DG|HF|CC\|[^}]*|Yes)(\|[^}]*)?\}\}", "", s)
    return re.sub(r"\s+", " ", s).strip()


def tag(s):
    # a tag after "X and Y{{DG}}" or "X, Y{{DG}}" marks only part of a list as DLC -> base
    m0 = re.search(r"\{\{(DB|DG|HF)", s)
    if m0 and re.search(r",| and ", clean(s[:m0.start()])):
        return "base"
    if "{{DB" in s: return "Dragonborn"
    if "{{DG" in s: return "Dawnguard"
    if "{{HF" in s: return "Hearthfire"
    m = re.search(r"\{\{CC\|([^}|]*)", s)
    return ("CC: " + m.group(1)) if m else "base"


def main():
    t = load()
    sections = (("apparel", t[t.index("===Apparel Effects==="):t.index("===Weapon Effects===")]),
                ("weapon", t[t.index("===Weapon Effects==="):t.index("==== Skill and Perk")]))
    out, group = [], None
    for kind, sec in sections:
        for row in sec.split("\n|-")[1:]:
            lines = [l for l in row.strip().split("\n") if l.strip()]
            body = [l for l in lines if l.startswith("|") and not l.startswith("|}") and "||" in l]
            if not body:
                continue
            for l in lines:
                m = re.match(r"^!rowspan=\d+[^|]*\|\s*(.*)$", l)
                if m: group = clean(m.group(1))
            names = [l for l in lines if l.startswith("!") and "icon|" not in l and not re.match(r"^!(rowspan|colspan)", l)]
            raw_name = re.sub(r"^!\s*(width=1\|)?", "", names[-1])
            short = clean(raw_name).replace(" & / ", " & ")
            if short in SKIP:
                continue
            sources = []
            for b in re.findall(r"^\*\s+(.*)$", row, re.M):  # top-level bullets only
                sources.append({"text": clean(b), "src": tag(b)})
            src = tag(raw_name)
            if src == "base" and sources and all(x["src"] != "base" for x in sources):
                src = sources[0]["src"]  # only obtainable from DLC/CC items
            name, aliases = NAMES.get((group, short), (None, []))
            if not name:
                if group in ("Fortify Skill", "Fortify Attribute"):
                    name = "Fortify " + short.replace("-Handed", "-handed")
                elif group == "Fortify Other":
                    name = short if short in ("Dark Moon", "Empower Necromancy") else "Fortify " + short
                elif group == "Resist":
                    name = "Resist " + short
                elif group == "Absorb":
                    name = "Absorb " + short
                elif group == "Damage":
                    name = short + " Damage"
                else:
                    name = short
            e = {"name": name, "type": kind, "group": group, "src": src, "sources": sources[:5]}
            if aliases: e["aliases"] = aliases
            if kind == "apparel":
                cells = [c.strip() for c in body[0][1:].split("||")]
                e["slots"] = [n for n, c in zip(["head", "neck", "chest", "hands", "finger", "feet", "shield"], cells) if "{{Yes}}" in c]
                magtext, cost = [clean(x) for x in body[1][1:].split("||")[:2]]
            else:
                cells = [clean(x) for x in body[0][1:].split("||")]
                e["school"], magtext, cost = cells[0], cells[1], cells[2]
            e["cost"] = float(re.sub(r"[^\d.]", "", cost) or 0)
            m = re.search(r"\d+(?:\.\d+)?", magtext)
            if m and magtext != "n/a":
                e["base"] = BASE_OVERRIDE.get(name, float(m.group(0)))
                default_fmt = (magtext[:m.start()] + "{v}" + magtext[m.end():]).replace("-{v}", "−{v}")
                if " & " in name and "Magicka Regen" in name:
                    default_fmt = "−{v}% casting cost, +10% Magicka regen"
                e["fmt"] = FMT.get(name, default_fmt)
            else:
                e["base"] = None
                e["fmt"] = "On/off effect (use a petty soul gem)"
            # which perks boost it
            perks = []
            if group == "Fortify Skill" or (" & " in name and "Magicka Regen" in name): perks.append("insightful")
            if group == "Fortify Attribute": perks.append("corpus")
            for el, p in (("Fire", "fire"), ("Frost", "frost"), ("Shock", "storm")):
                if name in (f"Resist {el}", f"{el} Damage") or name == "Chaos Damage": perks.append(p)
            if perks: e["perks"] = perks
            if kind == "weapon" and (name in ("Fire Damage", "Frost Damage", "Shock Damage", "Chaos Damage")):
                e["elem"] = ["fire", "frost", "shock"] if name == "Chaos Damage" else [name.split()[0].lower()]
            out.append(e)
    names = [e["name"] for e in out]
    assert len(names) == len(set(names)), "duplicate names"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_enchant_data.py from UESP Skyrim:Enchanting_Effects. Do not edit by hand.\n")
        f.write("window.ENCHANT_DATA = ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"{len(out)} enchantments -> {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
