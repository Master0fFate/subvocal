#!/usr/bin/env python3
"""Measure the real token cost of every string in lexicon/candidates.json.

Subvocal's rule is "tokens, not characters": a symbol earns a place in the
dialect only if a real tokenizer says it is cheaper. This script produces
those numbers. It never guesses.

Backends (pick with --backend):

  anthropic   Exact counts from Anthropic's free count_tokens endpoint.
              Needs ANTHROPIC_API_KEY. Stdlib only, no SDK.
  claude-cli  Exact counts through an installed, logged-in `claude` CLI.
              Each string is one tiny `claude -p` call; the token cost is the
              difference in reported input tokens against a fixed baseline
              prompt. Uses your Claude subscription (cheap: cached prefix,
              ~4 output tokens per call). Use --model haiku to keep it cheap.
  tiktoken    Offline approximation with an OpenAI encoding (o200k_base by
              default). Not Claude's tokenizer. Good for other models and for
              quick iteration; never publish Claude numbers from it.

Connectives and operators are measured mid-line, between two ordinary words
(`a <s> b`), because that is where they sit in a trace. Line openers
(concepts with "at": "start", and fillers) are measured at the start of a
line, newline included (`a\n<s> b`), so they compare fairly with each other.

Results are cached per backend+model in lexicon/.cache/, so re-runs only
measure new strings.

Usage:
  python3 scripts/measure_tokens.py --backend claude-cli --model haiku
  python3 scripts/measure_tokens.py --backend anthropic --model claude-opus-5-5
  python3 scripts/measure_tokens.py --backend tiktoken --encoding o200k_base
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CANDIDATES = REPO / "lexicon" / "candidates.json"
OUT = REPO / "lexicon" / "measured.json"
CACHE_DIR = REPO / "lexicon" / ".cache"

# The probe sentence. The candidate string goes between "a" and "b".
PREFIX = "Ignore the sample below and reply with exactly: ok\nsample: a"
SUFFIX = " b"


def key(s: str, at: str = "mid") -> str:
    """Cache/measure key. Line-start strings are stored with a leading newline."""
    return "\n" + s if at == "start" and not s.startswith("\n") else s


def probe(s: str | None) -> str:
    if s is None:
        return PREFIX + SUFFIX
    if s.startswith("\n"):          # line-start position: the newline is part of the cost
        return PREFIX + s + SUFFIX
    return PREFIX + " " + s + SUFFIX


def all_strings(cands: dict) -> list[str]:
    seen: list[str] = []

    def add(s: str) -> None:
        if s not in seen:
            seen.append(s)

    for c in cands["concepts"]:
        at = c.get("at", "mid")
        for s in c["english"]:
            add(key(s, at))
        for n in c["notation"]:
            add(key(n["s"], at))
    for f in cands.get("fillers", []):
        add(key(f, "start"))
    for a in cands.get("aliases", []):
        add(a)
    for a in cands.get("anchors", []):   # sanity: "the the the" must cost 3x "the"
        add(a)
    for pair in cands.get("language_pairs", []):
        for text in pair.values():
            add(text)
    add("\n")
    add(". ")
    return seen


# --------------------------------------------------------------------------
# Backends. Each returns a callable: prompt text -> total input tokens.
# --------------------------------------------------------------------------

def backend_anthropic(model: str):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        sys.exit("measure: ANTHROPIC_API_KEY not set (needed for --backend anthropic)")
    base = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
    url = base + "/v1/messages/count_tokens"

    def count(text: str) -> int:
        body = json.dumps({"model": model, "messages": [{"role": "user", "content": text}]}).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        })
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return int(json.load(r)["input_tokens"])
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 529) and attempt < 4:
                    time.sleep(2 ** attempt)
                    continue
                raise
        raise RuntimeError("unreachable")

    return count


def backend_claude_cli(model: str):
    exe = shutil.which("claude")
    if not exe:
        sys.exit("measure: `claude` CLI not found on PATH (needed for --backend claude-cli)")
    workdir = tempfile.mkdtemp(prefix="subvocal-measure-")  # empty dir: no CLAUDE.md, no project settings

    def count(text: str) -> int:
        cmd = [exe, "-p", text, "--output-format", "json", "--model", model,
               "--system-prompt", "Reply with exactly: ok",
               "--tools", "", "--setting-sources", "project", "--strict-mcp-config",
               "--disable-slash-commands", "--no-session-persistence"]
        last = ""
        for attempt in range(4):
            p = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True, timeout=180)
            last = p.stdout + p.stderr
            try:
                u = json.loads(p.stdout)["usage"]
                return int(u.get("input_tokens", 0)) + int(u.get("cache_creation_input_tokens", 0)) \
                    + int(u.get("cache_read_input_tokens", 0))
            except (ValueError, KeyError, TypeError):
                time.sleep(2 + 3 * attempt)
        raise RuntimeError("claude -p gave no usage: " + last[:300])

    return count


def backend_tiktoken(encoding: str):
    try:
        import tiktoken  # type: ignore
    except ModuleNotFoundError:
        sys.exit("measure: `pip install tiktoken` first (needed for --backend tiktoken)")
    enc = tiktoken.get_encoding(encoding)
    return lambda text: len(enc.encode(text))


# --------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backend", required=True, choices=["anthropic", "claude-cli", "tiktoken"])
    ap.add_argument("--model", default="haiku", help="model for anthropic/claude-cli (default: haiku)")
    ap.add_argument("--encoding", default="o200k_base", help="tiktoken encoding (default: o200k_base)")
    ap.add_argument("--jobs", type=int, default=6, help="parallel requests (default 6)")
    ap.add_argument("--candidates", default=str(CANDIDATES))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--only", action="append", help="measure only this string; repeat as --only=STR (debugging)")
    args = ap.parse_args()

    cands = json.loads(Path(args.candidates).read_text(encoding="utf-8"))
    strings = args.only if args.only else all_strings(cands)

    if args.backend == "anthropic":
        count, label = backend_anthropic(args.model), args.model
    elif args.backend == "claude-cli":
        count, label = backend_claude_cli(args.model), args.model
    else:
        count, label = backend_tiktoken(args.encoding), args.encoding

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{args.backend}-{label}.json".replace("/", "_")
    cache: dict = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}
    lock = threading.Lock()

    def save() -> None:
        cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")

    todo = [s for s in strings if s not in cache]
    print(f"measure: backend={args.backend} model={label} cached={len(strings) - len(todo)} todo={len(todo)}",
          file=sys.stderr)

    # Bracketed chunks. A CLI host can inject context that changes between
    # calls (a reminder, a date), which shifts every absolute count. So each
    # chunk is measured between two baseline calls, and a chunk is accepted
    # only when both baselines agree. A drift mid-chunk discards the chunk and
    # measures it again. Deltas are therefore never taken across a drift.
    chunk_size = max(1, args.jobs)
    with cf.ThreadPoolExecutor(max_workers=chunk_size) as ex:
        for i in range(0, len(todo), chunk_size):
            chunk = todo[i:i + chunk_size]
            for attempt in range(6):
                before = count(probe(None))
                totals = list(ex.map(lambda s: count(probe(s)), chunk))
                after = count(probe(None))
                if before == after:
                    break
                print(f"  baseline drifted ({before} -> {after}); re-measuring chunk", file=sys.stderr)
            else:
                sys.exit("measure: baseline keeps drifting; backend not usable for deltas right now")
            with lock:
                for s, total in zip(chunk, totals):
                    cache[s] = total - before
                    print(f"  {cache[s]:>2}  {s!r}", file=sys.stderr)
                save()

    out = {
        "backend": args.backend,
        "model": label,
        "probe": "a <s> b (mid-line, leading space)",
        "measured_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "tokens": {s: cache[s] for s in strings},
    }
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"measure: wrote {args.out} ({len(strings)} strings)", file=sys.stderr)


if __name__ == "__main__":
    main()
