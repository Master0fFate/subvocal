#!/usr/bin/env python3
"""Turn measured token costs into the subvocal lexicon, and write it into docs/DIALECT.md.

Input:  lexicon/candidates.json   concepts, English forms, notation candidates
        lexicon/measured.json     real token costs (scripts/measure_tokens.py)
Output: lexicon/lexicon.json      the chosen dialect, with every number behind it
        docs/DIALECT.md           the block between the LEXICON markers

Selection rule, per concept:

  1. Rank notation candidates by (token cost, domain, author order).
     Domains code and math rank before ascii shorthand: they are
     in-distribution for every major model, invented abbreviations are not.
  2. Skip a candidate that another concept already owns, unless the concept
     lists that owner in "may_share" (`→` may mean both "so" and "returns").
  3. Keep the winner only if it is strictly cheaper than the median English
     form models write for that concept. Otherwise the cheapest English word
     is the canonical form: notation that saves nothing is not used.

Everything a concept rejected because it costs more than the winner goes on
the banned list. That list is the point of measuring: `∴` looks like one
character and costs 4 tokens.

Usage:
  python3 scripts/build_lexicon.py           # rebuild lexicon.json + DIALECT.md
  python3 scripts/build_lexicon.py --check   # CI: fail if anything is stale
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CANDIDATES = REPO / "lexicon" / "candidates.json"
MEASURED = REPO / "lexicon" / "measured.json"
LEXICON = REPO / "lexicon" / "lexicon.json"
DIALECT = REPO / "docs" / "DIALECT.md"
BEGIN = "<!-- LEXICON:BEGIN"
END = "<!-- LEXICON:END -->"
DOMAIN_RANK = {"code": 0, "math": 0, "ascii": 1}


def key(s: str, at: str) -> str:
    return "\n" + s if at == "start" and not s.startswith("\n") else s


def build(cands: dict, measured: dict) -> dict:
    tok = measured["tokens"]
    nl = tok.get("\n", 0)
    owner: dict[str, str] = {}
    chosen, plain, banned = [], [], {}

    def cost(s: str, at: str) -> int:
        k = key(s, at)
        if k not in tok:
            sys.exit(f"build_lexicon: {k!r} not measured; run scripts/measure_tokens.py first")
        # Line openers are measured with their newline; report the marker alone.
        return tok[k] - (nl if at == "start" else 0)

    for c in cands["concepts"]:
        at = c.get("at", "mid")
        eng = sorted(((cost(s, at), s) for s in c["english"]), key=lambda x: x[0])
        eng_median = statistics.median(n for n, _ in eng)
        ranked = sorted(
            ((cost(n["s"], at), DOMAIN_RANK.get(n["domain"], 2), i, n) for i, n in enumerate(c["notation"])),
            key=lambda x: x[:3],
        )
        winner = None
        for n_cost, _, _, n in ranked:
            o = owner.get(n["s"])
            if o and o != c["id"] and o not in c.get("may_share", []):
                continue
            winner = (n_cost, n)
            break

        entry = {
            "id": c["id"], "meaning": c["meaning"], "at": at,
            "english": [{"s": s, "tokens": n} for n, s in eng],
            "english_median": eng_median,
        }
        if winner and (winner[0] < eng_median or c.get("structural")):
            n_cost, n = winner
            owner.setdefault(n["s"], c["id"])
            entry.update(write=n["s"], show=n.get("show", n["s"]), tokens=n_cost, domain=n["domain"],
                         saves=round(eng_median - n_cost, 1))
            chosen.append(entry)
            for r_cost, _, _, r in ranked:
                if r["s"] != n["s"] and r_cost > n_cost:
                    banned.setdefault(r["s"], {"s": r["s"], "tokens": r_cost, "use": n["s"]})
        else:
            entry.update(write=eng[0][1], tokens=eng[0][0], domain="english", saves=0)
            plain.append(entry)
            for r_cost, _, _, r in ranked:
                if r_cost > eng[0][0]:
                    banned.setdefault(r["s"], {"s": r["s"], "tokens": r_cost, "use": eng[0][1]})

    # Only symbols and marker forms go on the banned list. Ordinary words
    # ("calls", "assume") and numbers stay legal: they are vocabulary, not
    # notation, and a model must remain free to name things.
    canonical = {e["write"] for e in chosen + plain}
    banned_list = sorted((b for s, b in banned.items()
                          if s not in canonical and not s.isalpha() and not s.isdigit()),
                         key=lambda b: (-b["tokens"], b["s"]))

    aliases = {a: tok[a] for a in cands.get("aliases", []) if a in tok}
    fillers = sorted(({"s": f, "tokens": tok[key(f, "start")] - nl} for f in cands.get("fillers", [])
                      if key(f, "start") in tok), key=lambda f: -f["tokens"])
    langs: dict[str, list[int]] = {}
    for pair in cands.get("language_pairs", []):
        for lang, text in pair.items():
            if text in tok:
                langs.setdefault(lang, []).append(tok[text])
    return {
        "generated_by": "scripts/build_lexicon.py",
        "measured_with": {k: measured[k] for k in ("backend", "model", "measured_at") if k in measured},
        "notation": chosen,
        "keep_english": plain,
        "banned": banned_list,
        "aliases": aliases,
        "fillers": fillers,
        "languages": {k: sum(v) for k, v in langs.items()},
    }


def fmt(s: str) -> str:
    if s == "\n":
        return "newline"
    return "`" + s.replace("|", "\\|") + "`"


def render(lex: dict) -> str:
    m = lex["measured_with"]
    lines = [
        f"{BEGIN} generated by scripts/build_lexicon.py from lexicon/measured.json; edit candidates.json, not this block -->",
        f"Measured: `{m.get('backend')}` / `{m.get('model')}`, {m.get('measured_at')}. Every cost below is real tokens, not characters. Line-start costs exclude the newline itself.",
        "",
        "| Write | Instead of | Tokens |",
        "|---|---|---|",
    ]
    rows: dict[tuple, dict] = {}
    for e in lex["notation"]:
        if e["id"] == "step_sep":
            continue
        r = rows.setdefault((e["write"], e["at"]), {"show": e["show"], "at": e["at"], "tokens": e["tokens"], "eng": []})
        r["eng"] += e["english"]
    for r in rows.values():
        eng = sorted(r["eng"], key=lambda x: x["tokens"])
        names = ", ".join(dict.fromkeys(x["s"] for x in eng[:4]))
        lo, hi = eng[0]["tokens"], eng[-1]["tokens"]
        rng = str(lo) if lo == hi else f"{lo}-{hi}"
        pos = " (line start)" if r["at"] == "start" else ""
        lines.append(f"| {fmt(r['show'])}{pos} | {names} | {r['tokens']} vs {rng} |")
    lines += [
        "",
        "Plain word already cheapest, write it as is: "
        + ", ".join(fmt(e["write"]) for e in lex["keep_english"]) + ".",
        "",
        "Banned, more tokens than the form above: "
        + " ".join(f"{fmt(b['s'])}={b['tokens']}" for b in lex["banned"]) + ".",
        "",
    ]
    lg = lex.get("languages", {})
    if lg.get("en"):
        others = ", ".join(f"{k} +{round(100 * (v - lg['en']) / lg['en'])}%" for k, v in lg.items() if k != "en")
        lines += [f"Language: the same sentences cost more outside English ({others}). Think in English.", ""]
    a = lex["aliases"]
    one = [k for k, v in a.items() if len(k) == 1 and v == 1]
    two = [k for k, v in a.items() if len(k) == 2 and k.isalpha() and k.isupper()]
    digit = [k for k, v in a.items() if any(ch.isdigit() for ch in k)]
    if one:
        lines.append(
            "Alias names: one capital letter = 1 token. Two capitals = "
            + (str(a[two[0]]) if two else "2") + ". Letter+digit ("
            + ", ".join(digit[:3]) + ") = " + (str(a[digit[0]]) if digit else "3") + ": banned.")
    lines.append(END)
    return "\n".join(lines)


def splice(text: str, block: str) -> str:
    b, e = text.find(BEGIN), text.find(END)
    if b == -1 or e == -1:
        raise SystemExit("build_lexicon: LEXICON markers missing")
    return text[:b] + block + text[e + len(END):]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="exit 1 if lexicon.json or DIALECT.md is out of date")
    args = ap.parse_args()

    cands = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    measured = json.loads(MEASURED.read_text(encoding="utf-8"))
    lex = build(cands, measured)
    lex_text = json.dumps(lex, ensure_ascii=False, indent=1) + "\n"
    block = render(lex)

    stale = []
    if not LEXICON.exists() or LEXICON.read_text(encoding="utf-8") != lex_text:
        stale.append(LEXICON)
        if not args.check:
            LEXICON.write_text(lex_text, encoding="utf-8")
    old = DIALECT.read_text(encoding="utf-8")
    new = splice(old, block)
    if new != old:
        stale.append(DIALECT)
        if not args.check:
            DIALECT.write_text(new, encoding="utf-8")

    if args.check and stale:
        sys.exit("build_lexicon: stale, run scripts/build_lexicon.py: " + ", ".join(str(p.relative_to(REPO)) for p in stale))
    n, p, b = len(lex["notation"]), len(lex["keep_english"]), len(lex["banned"])
    print(f"build_lexicon: {n} notation forms, {p} plain words, {b} banned; "
          + ("up to date" if not stale else "updated " + ", ".join(str(s.relative_to(REPO)) for s in stale)))


if __name__ == "__main__":
    main()
