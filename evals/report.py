#!/usr/bin/env python3
"""Summarise an eval run (evals/run.py output) as a Markdown table.

Per arm:
  thinking   total thinking tokens on the task set, the change of that sum
             against baseline, and the geometric mean of the per-prompt ratio
             against baseline, which one very long call cannot dominate
  accuracy   tasks answered correctly
  reply      median reply tokens on tasks and on open prompts: should not
             move, because subvocal must leave the reply alone
  leaks      replies showing subvocal notation or naming subvocal
  language   the Croatian open prompt answered in Croatian

Prompts where every arm thought for 0 tokens carry no signal about thinking
style; they are counted for accuracy and reply length but left out of the
thinking totals, and the report says how many were left out.

Usage:
  python3 evals/report.py evals/snapshots/sonnet.jsonl
  python3 evals/report.py evals/snapshots/sonnet.jsonl --json
"""

from __future__ import annotations

import argparse
import collections
import json
import math
import statistics
import sys
from pathlib import Path

ORDER = ["baseline", "control", "lite", "plain", "subvocal", "ultrasubvocal"]


def load(p: Path) -> list[dict]:
    rows = [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
    # Keep the latest successful record per (kind, id, arm, run).
    latest: dict = {}
    for r in rows:
        if r.get("error"):
            continue
        latest[(r["kind"], r["id"], r["arm"], r["run"])] = r
    return list(latest.values())


def pct(new: float, old: float) -> str:
    if not old:
        return "n/a"
    return f"{100 * (new - old) / old:+.0f}%"


def summarise(rows: list[dict]) -> dict:
    seen = {r["arm"] for r in rows}
    arms = [a for a in ORDER if a in seen] + sorted(seen - set(ORDER))
    tasks = [r for r in rows if r["kind"] != "open"]
    opens = [r for r in rows if r["kind"] == "open"]

    # Mean thinking per (prompt, arm) across runs, then compare prompt by prompt.
    per = collections.defaultdict(list)
    for r in tasks:
        per[(r["id"], r["arm"])].append(r["thinking_tokens"])
    ids = sorted({r["id"] for r in tasks})
    complete = [i for i in ids if all((i, a) in per for a in arms)]
    signal = [i for i in complete if any(statistics.mean(per[(i, a)]) > 0 for a in arms)]

    out = {"arms": {}, "prompts": len(ids), "prompts_with_thinking": len(signal),
           "runs": max((r["run"] for r in rows), default=0) + 1,
           "model": next((r["model"] for r in rows), None), "backend": next((r["backend"] for r in rows), None)}
    for a in arms:
        t = [r for r in tasks if r["arm"] == a]
        o = [r for r in opens if r["arm"] == a]
        total = sum(statistics.mean(per[(i, a)]) for i in signal)
        hr = [r for r in o if "lang_ok" in r]
        out["arms"][a] = {
            "thinking_total": round(total),
            "thinking_median_call": statistics.median([r["thinking_tokens"] for r in t]) if t else None,
            "accuracy": f"{sum(1 for r in t if r.get('correct'))}/{len(t)}",
            "accuracy_rate": round(sum(1 for r in t if r.get("correct")) / len(t), 3) if t else None,
            "reply_median_tasks": statistics.median([r["answer_tokens"] for r in t]) if t else None,
            "reply_median_open": statistics.median([r["answer_tokens"] for r in o]) if o else None,
            "leaks": sum(1 for r in t + o if r.get("leaks")),
            "refused": sum(1 for r in t + o if r.get("refused")),
            "calls": len(t) + len(o),
            "hr_ok": f"{sum(1 for r in hr if r['lang_ok'])}/{len(hr)}" if hr else None,
        }
    for a in arms:
        s = out["arms"][a]
        if "baseline" in out["arms"]:
            s["vs_baseline"] = pct(s["thinking_total"], out["arms"]["baseline"]["thinking_total"])
            ratios = [statistics.mean(per[(i, a)]) / statistics.mean(per[(i, "baseline")])
                      for i in signal if statistics.mean(per[(i, "baseline")]) > 0 and statistics.mean(per[(i, a)]) > 0]
            s["geomean_vs_baseline"] = pct(math.exp(statistics.mean(math.log(r) for r in ratios)), 1) if ratios else "n/a"
        if "control" in out["arms"]:
            s["vs_control"] = pct(s["thinking_total"], out["arms"]["control"]["thinking_total"])
    # Per-prompt view for subvocal vs baseline: how often did subvocal think less?
    for a in arms:
        if a != "baseline" and "baseline" in arms:
            wins = sum(1 for i in signal if statistics.mean(per[(i, a)]) < statistics.mean(per[(i, "baseline")]))
            out.setdefault("less_thinking_than_baseline", {})[a] = f"{wins}/{len(signal)}"
    return out


def markdown(s: dict) -> str:
    lines = [
        f"Model `{s['model']}` via `{s['backend']}`, {s['prompts']} task prompts x {s['runs']} run(s). "
        f"Thinking totals use the {s['prompts_with_thinking']} prompts where at least one arm thought.",
        "",
        "| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for a, v in s["arms"].items():
        lines.append(f"| {a} | {v['thinking_total']} | {v.get('vs_baseline', '')} | {v.get('geomean_vs_baseline', '')} | {v.get('vs_control', '')} | "
                     f"{v['accuracy']} | {v['reply_median_tasks']} / {v['reply_median_open']} | "
                     f"{v['leaks']}/{v['calls']} | {v['hr_ok'] or '-'} | {v['refused']}/{v['calls']} |")
    less = s.get("less_thinking_than_baseline", {})
    if less:
        lines.append("")
        for a, v in less.items():
            lines.append(f"- {a} thought less than baseline on {v} prompts.")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results", type=Path)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    rows = load(args.results)
    if not rows:
        sys.exit("report: no successful records")
    s = summarise(rows)
    print(json.dumps(s, indent=1) if args.json else markdown(s))


if __name__ == "__main__":
    main()
