# Evals

Steno makes three claims, and each one is measured here instead of assumed:

1. **Fewer thinking tokens.** Compared against no instruction (baseline) and,
   more importantly, against a plain "keep your internal reasoning concise"
   (control). Beating baseline is easy; beating control is the bar.
2. **Same accuracy.** Every task prompt has one checkable final answer.
3. **Reply unchanged.** Reply length on tasks and on open requests, notation
   leaking into the reply, and whether a Croatian question still gets a
   Croatian answer while steno thinks in English.

## Arms

| Arm | System prompt addition |
|---|---|
| `baseline` | none |
| `control` | "Keep your internal reasoning concise. Your reply is unaffected: write it as you normally would." |
| `lite` | `skills/steno-lite/SKILL.md` body, exactly as the hooks inject it |
| `steno` | the SessionStart ruleset + the per-turn reminder, exactly as the hooks inject them |
| `ultrasteno` | same, ultrasteno |

The arm text is produced by calling the hook code, so the eval tests what ships.

## Prompt sets

- `prompts/tasks.jsonl`: 18 tasks (arithmetic, logic, code tracing, dates,
  combinatorics, probability), each ending with `Final answer: <x>`. Answers
  were computed, not recalled.
- `prompts/open.jsonl`: 6 open requests, one in Croatian.

## Running

```bash
python3 evals/run.py --model sonnet --runs 2 --out evals/snapshots/sonnet.jsonl
python3 evals/report.py evals/snapshots/sonnet.jsonl
```

`--backend claude-cli` (default) uses a logged-in `claude` CLI, which reports
thinking tokens directly. Every call runs from an empty directory with
project-only settings, no tools, no MCP servers, no slash commands and a fixed
system prompt, so nothing installed on the machine reaches any arm.
`--backend anthropic` uses the Messages API (`ANTHROPIC_API_KEY`) and derives
thinking tokens as output minus the counted reply.

Results append one JSON line per call; an interrupted run resumes. Refusals
(`stop_reason: refusal`) are recorded and reported per arm.

## Reading the numbers

- Thinking is adaptive: on easy prompts a model may not think at all. Totals
  only include prompts where at least one arm thought, and the report says how
  many that was.
- Thinking length varies a lot between runs of the same prompt. Use at least
  two runs, and treat differences under ~15% as noise.
- The thinking text itself is not returned by these hosts, so the eval
  measures cost and outcome, not whether the trace literally follows the
  dialect.

Current snapshots and what they show: [`docs/HONEST-NUMBERS.md`](../docs/HONEST-NUMBERS.md).
