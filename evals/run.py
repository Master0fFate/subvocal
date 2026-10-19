#!/usr/bin/env python3
"""Run the subvocal eval: thinking tokens, accuracy, and an unchanged reply.

Every prompt runs once per arm (and per --runs). Arms:

  baseline     no addition to the system prompt
  control      "Keep your internal reasoning concise." The honest comparison:
               what subvocal adds on top of simply asking for brevity
  subvocal     the subvocal mode text as the hooks inject it
  ultrasubvocal   the ultrasubvocal mode text as the hooks inject it

Two prompt sets:

  prompts/tasks.jsonl  questions with a checkable final answer. Measures
                       thinking tokens and accuracy.
  prompts/hard.jsonl   the same, multi-step: the model thinks for hundreds to
                       thousands of tokens, the regime subvocal targets.
  prompts/open.jsonl   ordinary requests with no single answer. Measures that
                       the reply is unchanged: its length, its language (one
                       prompt is Croatian), and leaks of subvocal notation.

Backends:

  claude-cli  (default) an installed, logged-in `claude` CLI. Its JSON result
              reports thinking tokens directly. Each call runs from an empty
              temp dir with project-only settings, no tools, no MCP, no slash
              commands and a fixed system prompt, so no installed plugin or
              CLAUDE.md can leak into any arm.
  anthropic   the Messages API with extended thinking. Needs
              ANTHROPIC_API_KEY. Thinking tokens are derived: output tokens
              minus the counted tokens of the visible reply.

Results append to a JSONL file, one line per call, so an interrupted run
resumes where it stopped. Summarise with evals/report.py.

Usage:
  python3 evals/run.py --model sonnet --runs 2 --out evals/snapshots/sonnet.jsonl
  python3 evals/report.py evals/snapshots/sonnet.jsonl
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
BASE_SYSTEM = "You are Claude, a helpful assistant."
CONTROL = "Keep your internal reasoning concise. Your reply is unaffected: write it as you normally would."
ARMS = ["baseline", "control", "subvocal", "ultrasubvocal"]


# --------------------------------------------------------------------------
# Arm text: taken from the hooks themselves, so the eval tests what ships.
# --------------------------------------------------------------------------

def hook_text(mode: str) -> str:
    js = "const c=require(process.argv[1]);process.stdout.write(c.buildRuleset(process.argv[2],process.argv[3]))"
    hooks = REPO / "src" / "hooks"
    env = {k: v for k, v in os.environ.items() if k != "CLAUDE_PLUGIN_ROOT"}
    out = subprocess.run(["node", "-e", js, str(hooks / "subvocal-config.js"), mode, str(hooks)],
                         capture_output=True, text=True, check=True, env=env)
    return out.stdout


def arm_system(arm: str) -> str | None:
    if arm == "baseline":
        return None
    if arm == "control":
        return CONTROL
    return hook_text(arm)


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------

FINAL = re.compile(r"final answer\s*[:：]\s*(.+)", re.I)


def final_answer(text: str) -> str | None:
    hits = FINAL.findall(text or "")
    if not hits:
        return None
    return hits[-1].strip().strip("*`_ ").strip()


def norm(s: str) -> str:
    return re.sub(r"[\s*`_.]+", " ", s.lower()).strip(" .")


def to_number(s: str) -> float | None:
    m = re.search(r"-?\d[\d,]*(?:\.\d+)?", s.replace("−", "-"))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return None


def score(task: dict, reply: str) -> bool:
    ans = final_answer(reply)
    if ans is None:
        return False
    kind = task["check"]
    if kind == "number":
        got = to_number(ans)
        return got is not None and any(abs(got - float(a)) < 1e-6 for a in task["answers"])
    if kind == "percent":
        got = to_number(ans)
        if got is None:
            return False
        if "decrease" in ans.lower() or "fall" in ans.lower() or "down" in ans.lower():
            got = -abs(got)
        return abs(got + 10) < 1e-6
    if kind == "knights":
        a = ans.lower()
        return bool(re.search(r"\ba\b[^,;]*knight", a) and re.search(r"\bb\b[^,;]*knave", a))
    n = norm(ans)
    return any(norm(a) == n or norm(a) in n for a in task["answers"])


CODE_FENCE = re.compile(r"```.*?```", re.S)
LEAKS = {
    "marker_line": re.compile(r"^\s*(=>|!:|\?\s|find:|do:|check:)", re.M),
    "alias_def": re.compile(r"(?<![:=<>!])\s:=\s"),
    "mentions_subvocal": re.compile(r"\bsubvocal\b", re.I),
}
HR_HINTS = re.compile(r"\b(je|što|funkcija|primjer|koja|koji|rekurzij\w*|se|za|na|ili)\b", re.I)


def leaks(reply: str) -> list[str]:
    prose = CODE_FENCE.sub("", reply or "")
    return [name for name, rx in LEAKS.items() if rx.search(prose)]


# --------------------------------------------------------------------------
# Backends: (system_addition, prompt) -> dict(reply, output_tokens, thinking_tokens)
# --------------------------------------------------------------------------

def backend_claude_cli(model: str, effort: str):
    exe = shutil.which("claude")
    if not exe:
        sys.exit("eval: `claude` CLI not found on PATH")
    workdir = tempfile.mkdtemp(prefix="subvocal-eval-")

    def call(system_add: str | None, prompt: str) -> dict:
        cmd = [exe, "-p", prompt, "--output-format", "json", "--model", model, "--effort", effort,
               "--system-prompt", BASE_SYSTEM, "--tools", "", "--setting-sources", "project",
               "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]
        if system_add:
            cmd += ["--append-system-prompt", system_add]
        last = ""
        for attempt in range(3):
            p = subprocess.run(cmd, cwd=workdir, capture_output=True, encoding="utf-8", errors="replace",
                               timeout=900, stdin=subprocess.DEVNULL)
            last = (p.stdout + p.stderr)[-400:]
            try:
                o = json.loads(p.stdout)
                u = o["usage"]
                thinking = int((u.get("output_tokens_details") or {}).get("thinking_tokens", 0))
                return {"reply": o.get("result", ""), "output_tokens": int(u["output_tokens"]),
                        "thinking_tokens": thinking, "thinking_source": "reported",
                        "refused": o.get("stop_reason") == "refusal"}
            except (ValueError, KeyError, TypeError):
                time.sleep(5 * (attempt + 1))
        raise RuntimeError("claude -p failed: " + last)

    return call


def backend_anthropic(model: str, thinking: str):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        sys.exit("eval: ANTHROPIC_API_KEY not set")
    base = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
    headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}

    def post(path: str, body: dict) -> dict:
        req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers=headers, method="POST")
        for attempt in range(6):
            try:
                with urllib.request.urlopen(req, timeout=900) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 529) and attempt < 5:
                    time.sleep(2 ** attempt)
                    continue
                raise
        raise RuntimeError("unreachable")

    def count(text: str) -> int:
        return post("/v1/messages/count_tokens", {"model": model, "messages": [{"role": "user", "content": text or "."}]})["input_tokens"]

    empty = None

    def call(system_add: str | None, prompt: str) -> dict:
        nonlocal empty
        system = BASE_SYSTEM + ("\n\n" + system_add if system_add else "")
        cfg = {"type": "adaptive"} if thinking == "adaptive" else {"type": "enabled", "budget_tokens": int(thinking)}
        o = post("/v1/messages", {"model": model, "max_tokens": 32000, "system": system, "thinking": cfg,
                                  "messages": [{"role": "user", "content": prompt}]})
        reply = "".join(b.get("text", "") for b in o.get("content", []) if b.get("type") == "text")
        if empty is None:
            empty = count(".")
        visible = max(0, count(reply) - empty)
        out = int(o["usage"]["output_tokens"])
        return {"reply": reply, "output_tokens": out, "thinking_tokens": max(0, out - visible),
                "thinking_source": "derived", "refused": o.get("stop_reason") == "refusal"}

    return call


# --------------------------------------------------------------------------

def load_jsonl(p: Path) -> list[dict]:
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backend", default="claude-cli", choices=["claude-cli", "anthropic"])
    ap.add_argument("--model", default="sonnet")
    ap.add_argument("--effort", default="high", help="claude-cli effort level (default high)")
    ap.add_argument("--thinking", default="adaptive", help="anthropic: 'adaptive' or a budget in tokens")
    ap.add_argument("--arms", default="baseline,control,subvocal,ultrasubvocal")
    ap.add_argument("--arm-file", action="append", default=[], metavar="NAME=PATH",
                    help="extra arm whose system addition is the text of PATH (repeatable)")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--sets", default="tasks,open", help="comma list of prompt sets under evals/prompts: tasks, hard, open")
    ap.add_argument("--open-runs", type=int, default=1, help="runs for the open set (default 1)")
    ap.add_argument("--only", help="comma list of prompt ids")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--out", required=True)
    ap.add_argument("--dry-run", action="store_true", help="print the plan and arm sizes, call nothing")
    args = ap.parse_args()

    arms = [a for a in args.arms.split(",") if a]
    extra = dict(spec.split("=", 1) for spec in args.arm_file)
    for a in arms:
        if a not in ARMS and a not in extra:
            sys.exit(f"eval: unknown arm {a!r}; choose from {ARMS} or pass --arm-file {a}=PATH")
    systems = {a: Path(extra[a]).read_text(encoding="utf-8") if a in extra else arm_system(a) for a in arms}

    sets = [k for k in args.sets.split(",") if k]
    jobs: list[dict] = []
    only = set(args.only.split(",")) if args.only else None
    for kind in sets:
        runs = args.open_runs if kind == "open" else args.runs
        for item in load_jsonl(HERE / "prompts" / f"{kind}.jsonl"):
            if only and item["id"] not in only:
                continue
            for run in range(runs):
                for arm in arms:  # arms interleaved per prompt: time effects hit every arm alike
                    jobs.append({"kind": kind, "item": item, "arm": arm, "run": run})

    out = Path(args.out)
    done = set()
    if out.exists():
        for r in load_jsonl(out):
            if not r.get("error"):
                done.add((r["kind"], r["id"], r["arm"], r["run"]))
    todo = [j for j in jobs if (j["kind"], j["item"]["id"], j["arm"], j["run"]) not in done]

    print(f"eval: backend={args.backend} model={args.model} arms={arms} calls={len(jobs)} todo={len(todo)}", file=sys.stderr)
    for a in arms:
        print(f"  arm {a}: system addition {len(systems[a] or '')} chars", file=sys.stderr)
    if args.dry_run:
        return

    call = backend_claude_cli(args.model, args.effort) if args.backend == "claude-cli" \
        else backend_anthropic(args.model, args.thinking)
    out.parent.mkdir(parents=True, exist_ok=True)
    lock = threading.Lock()

    def work(j: dict) -> None:
        item = j["item"]
        rec = {"kind": j["kind"], "id": item["id"], "arm": j["arm"], "run": j["run"],
               "backend": args.backend, "model": args.model,
               "effort": args.effort if args.backend == "claude-cli" else args.thinking}
        t0 = time.time()
        try:
            r = call(systems[j["arm"]], item["prompt"])
            rec.update(thinking_tokens=r["thinking_tokens"], output_tokens=r["output_tokens"],
                       answer_tokens=r["output_tokens"] - r["thinking_tokens"],
                       thinking_source=r["thinking_source"], leaks=leaks(r["reply"]), reply=r["reply"],
                       refused=r["refused"])
            if j["kind"] != "open":
                rec["final"] = final_answer(r["reply"])
                rec["correct"] = score(item, r["reply"])
            elif item.get("lang") == "hr":
                rec["lang_ok"] = len(HR_HINTS.findall(r["reply"])) >= 5
        except Exception as e:  # recorded, retried on the next run
            rec["error"] = str(e)[:300]
        rec["seconds"] = round(time.time() - t0, 1)
        with lock:
            with out.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            tag = "ERR" if rec.get("error") else "REF" if rec.get("refused") else (("ok " if rec.get("correct") else "BAD") if j["kind"] != "open" else "   ")
            print(f"  {tag} {j['arm']:<10} {item['id']:<16} think={rec.get('thinking_tokens', '-')!s:>5} "
                  f"answer={rec.get('answer_tokens', '-')!s:>5} leaks={rec.get('leaks', [])}", file=sys.stderr)

    with cf.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as ex:
        list(ex.map(work, todo))
    print(f"eval: wrote {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
