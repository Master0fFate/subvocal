#!/usr/bin/env python3

from __future__ import annotations

import argparse
import html
from pathlib import Path

import report

ACCENT = "#6666ff"
GREY = "#9a9a9a"
INK = "#24292f"
LABELS = {"baseline": "baseline (no instruction)", "control": "\"keep reasoning concise\"", "lite": "subvocal (v0.1 lite text)", "plain": "plain sentence (0.1 default)",
          "subvocal": "subvocal (default)", "ultrasubvocal": "ultrasubvocal"}


def panel(s: dict, arms: list[str], x0: int, y0: int, width: int) -> tuple[list[str], int]:
    base = s["arms"]["baseline"]["thinking_total"]
    label_w = 190
    bar_w = width - label_w - 150
    row_h = 30
    parts = []
    title = f"{s['model']}, {s['prompts']} prompts x {s['runs']} runs, effort {s.get('effort') or 'high'}"
    parts.append(f'<text x="{x0}" y="{y0}" font-weight="600" fill="{INK}">{html.escape(title)}</text>')
    parts.append(f'<text x="{x0}" y="{y0 + 18}" fill="{GREY}" font-size="12">thinking tokens, total over the task set; lower is better</text>')
    y = y0 + 40
    biggest = max(s["arms"][a]["thinking_total"] for a in arms)
    for a in arms:
        v = s["arms"][a]
        w = round(bar_w * v["thinking_total"] / biggest) if biggest else 0
        color = ACCENT if a not in ("baseline", "control") else GREY
        parts.append(f'<text x="{x0 + label_w - 8}" y="{y + 15}" text-anchor="end" fill="{INK}">{html.escape(LABELS.get(a, a))}</text>')
        parts.append(f'<rect x="{x0 + label_w}" y="{y}" width="{w}" height="{row_h - 8}" rx="3" fill="{color}"/>')
        delta = "" if a == "baseline" else f" ({report.pct(v['thinking_total'], base)})"
        parts.append(f'<text x="{x0 + label_w + w + 8}" y="{y + 15}" fill="{INK}">{v["thinking_total"]}{delta}, accuracy {v["accuracy"]}</text>')
        y += row_h
    return parts, y


def main() -> None:
    ap = argparse.ArgumentParser(description="Draw an eval snapshot as an SVG bar chart of thinking tokens per arm.")
    ap.add_argument("results", nargs="+", type=Path)
    ap.add_argument("--arms", help="comma list, in order; default: every arm in the file")
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    width = 760
    panels = []
    y = 24
    for p in args.results:
        rows = report.load(p)
        s = report.summarise(rows)
        s["effort"] = next((r.get("effort") for r in rows), None)
        arms = [a for a in (args.arms.split(",") if args.arms else s["arms"]) if a in s["arms"]]
        parts, y = panel(s, arms, 16, y, width - 32)
        panels.extend(parts)
        y += 28
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{y}" viewBox="0 0 {width} {y}" '
        f'font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="13">',
        f'<rect width="{width}" height="{y}" fill="#ffffff"/>',
        *panels,
        "</svg>",
    ]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(svg) + "\n", encoding="utf-8")
    print(f"chart: wrote {args.out}")


if __name__ == "__main__":
    main()
