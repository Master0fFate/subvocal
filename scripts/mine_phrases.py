#!/usr/bin/env python3
"""Find the phrases your model actually repeats in its thinking.

Step one of the lexicon pipeline: before deciding what to replace, look at
real traces. This script collects reasoning text, counts recurring word
n-grams, and ranks them by how much text they occupy. Phrases already covered
by lexicon/candidates.json are marked, so what is left is the next batch of
candidates to measure.

Sources (any mix):
  - Claude Code transcripts: the default when no paths are given. Reads the
    `thinking` blocks from ~/.claude/projects/**/*.jsonl (or
    $CLAUDE_CONFIG_DIR/projects). Nothing leaves your machine; only n-gram
    counts are printed.
  - .jsonl files: thinking blocks in Claude Code / Messages API shape, or any
    object with a top-level "thinking" or "text" string.
  - .txt / .md files: read as plain reasoning text.

Usage:
  python3 scripts/mine_phrases.py                       # your Claude Code transcripts
  python3 scripts/mine_phrases.py traces/*.jsonl --top 60
  python3 scripts/mine_phrases.py --json > lexicon/mined.json
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CANDIDATES = REPO / "lexicon" / "candidates.json"
WORD = re.compile(r"[A-Za-z']+|[^\sA-Za-z']")

# N-grams made only of these carry no reusable meaning on their own.
STOP = {"the", "a", "an", "of", "to", "in", "is", "it", "and", "or", "for", "on", "be", "this", "that", "with", "as", "at", "by"}


def thinking_from_obj(obj, out: list[str]) -> None:
    if isinstance(obj, dict):
        if obj.get("type") == "thinking" and isinstance(obj.get("thinking"), str):
            out.append(obj["thinking"])
            return
        if isinstance(obj.get("thinking"), str):
            out.append(obj["thinking"])
        for v in obj.values():
            if isinstance(v, (dict, list)):
                thinking_from_obj(v, out)
    elif isinstance(obj, list):
        for v in obj:
            thinking_from_obj(v, out)


def collect(paths: list[Path]) -> list[str]:
    texts: list[str] = []
    for p in paths:
        try:
            if p.suffix == ".jsonl":
                for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except ValueError:
                        continue
                    before = len(texts)
                    thinking_from_obj(obj, texts)
                    if len(texts) == before and isinstance(obj, dict) and isinstance(obj.get("text"), str):
                        texts.append(obj["text"])
            else:
                texts.append(p.read_text(encoding="utf-8", errors="replace"))
        except OSError as e:
            print(f"mine: skip {p}: {e}", file=sys.stderr)
    return texts


def default_paths() -> list[Path]:
    root = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")) / "projects"
    return sorted(root.glob("**/*.jsonl")) if root.exists() else []


def covered_phrases() -> set[str]:
    try:
        c = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    out = {f.lower().strip(" ,.:") for f in c.get("fillers", [])}
    for k in c.get("concepts", []):
        out.update(s.lower().strip(" ,.:") for s in k.get("english", []))
    return out


def ngrams(texts: list[str], n_min: int, n_max: int) -> collections.Counter:
    counts: collections.Counter = collections.Counter()
    for t in texts:
        for sentence in re.split(r"[\n.!?;]+", t):
            words = [w.lower() for w in WORD.findall(sentence) if re.match(r"[A-Za-z']+$", w)]
            for n in range(n_min, n_max + 1):
                for i in range(len(words) - n + 1):
                    g = words[i:i + n]
                    if all(w in STOP for w in g):
                        continue
                    counts[" ".join(g)] += 1
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", type=Path)
    ap.add_argument("--top", type=int, default=40)
    ap.add_argument("--min-count", type=int, default=5)
    ap.add_argument("--n-min", type=int, default=2)
    ap.add_argument("--n-max", type=int, default=5)
    ap.add_argument("--json", action="store_true", help="print machine-readable results")
    args = ap.parse_args()

    paths = args.paths or default_paths()
    if not paths:
        sys.exit("mine: no input. Pass trace files, or run Claude Code with extended thinking first.")
    texts = collect(paths)
    words_total = sum(len(t.split()) for t in texts)
    if not texts:
        sys.exit("mine: no thinking text found in the given files.")

    counts = ngrams(texts, args.n_min, args.n_max)
    covered = covered_phrases()
    # Score = words the phrase occupies across all traces. Longer phrases that
    # repeat are the best targets: one alias or symbol replaces all of them.
    scored = [(c * len(g.split()), c, g) for g, c in counts.items() if c >= args.min_count]
    scored.sort(reverse=True)

    # Drop an n-gram when a longer one with nearly the same count contains it.
    kept: list[tuple[int, int, str]] = []
    for score, c, g in scored:
        if any(g in k[2] and k[1] >= 0.8 * c for k in kept):
            continue
        kept.append((score, c, g))
        if len(kept) >= args.top:
            break

    rows = [{"phrase": g, "count": c, "words": score, "covered": g in covered,
             "share": round(100 * score / max(words_total, 1), 2)} for score, c, g in kept]
    if args.json:
        print(json.dumps({"files": len(paths), "texts": len(texts), "words": words_total, "phrases": rows}, indent=1))
        return
    print(f"mine: {len(texts)} thinking texts, {words_total} words, from {len(paths)} files\n")
    print(f"{'count':>6} {'% words':>8}  phrase")
    for r in rows:
        mark = "  (in candidates)" if r["covered"] else ""
        print(f"{r['count']:>6} {r['share']:>7}%  {r['phrase']}{mark}")
    print("\nNext: add uncovered phrases to lexicon/candidates.json, then run measure_tokens.py and build_lexicon.py.")


if __name__ == "__main__":
    main()
