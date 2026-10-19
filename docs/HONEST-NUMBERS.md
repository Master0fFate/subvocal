# Honest numbers

Everything steno claims is measured here, including the results that went
against it. Measured on 2026-10-19 through Claude Code 2.1.303 (`claude -p`),
effort `high`, isolated calls (empty directory, project-only settings, no
tools, no MCP, fixed system prompt). Raw data: `evals/snapshots/*.jsonl`.

## Summary

| Claim | Result |
|---|---|
| The lexicon is cheaper per token | **Yes.** Every chosen form beats the English it replaces, measured with Claude's tokenizer. |
| Fewer thinking tokens, Haiku 5.5 | **No.** Strict steno: **+36%**, ultrasteno +35%, lite −4% (noise). A plain "keep your reasoning concise": −12%. |
| Fewer thinking tokens, Sonnet 5.5 | **Not shown.** Sonnet thought on only a few tasks; lite made it think more often. |
| Same accuracy | **Yes.** 36/36 in every arm on both models. |
| Reply unchanged | **Mostly.** No notation leaked into any reply (0/42 per arm) and the Croatian question got a Croatian answer in every arm. Strict-mode replies to open requests ran about 13% shorter (median 587 vs 675 tokens). |
| Works on every model | **No.** Sonnet 5.5 and Opus 5.5 decline the strict ruleset. Lite is accepted by all three. |

Steno therefore ships **off by default** (`manual`). The measured lexicon,
the pipeline that produced it, and the eval harness are the solid parts.

## 1. Token costs (the lexicon)

`scripts/measure_tokens.py --backend claude-cli --model haiku`: each string is
sent inside a fixed probe (`a <s> b`, or at line start for markers) and its
cost is the difference in reported input tokens against the bare probe. Each
chunk of strings is bracketed by two baseline calls and re-measured if they
disagree, because the CLI's injected context can shift between calls. Sanity
anchors: `the` = 1 token, `the the the` = 3. A spot check of five strings on
`claude-opus-5-5` gave identical counts.

Highlights (full data in `lexicon/lexicon.json`):

- `→` and `=>` cost 1 token; `->` costs 2; `∴ ≠ ≥ ≤ ≈ ∀ ∃ ∈ ∅ ✓ ✗ ¬ ∧ ∨` cost 4 each.
- `true`/`false` cost 1; `ok`/`yes` cost 2; `✓`/`✗` cost 4.
- `because` and `about` cost 1 and beat every abbreviation (`b/c` 3, `~` 3).
- One capital letter as an alias costs 1 token; `C1`-style aliases cost 3.
- The same three sentences cost +55% in Croatian, +97% in German and +47% in
  Spanish compared with English.

## 2. Model support (refusals)

With the strict ruleset in the system prompt, the safeguards on Sonnet 5.5 and
Opus 5.5 decline every request (`stop_reason: refusal`), including "What is
17×23?". Haiku 5.5 answers normally.

| Model | lite | steno | ultrasteno |
|---|---|---|---|
| Haiku 5.5 | 42/42 answered | 42/42 answered | 42/42 answered |
| Sonnet 5.5 | 42/42 answered | 0/3 answered | 0/3 answered |
| Opus 5.5 | 3/3 answered | 0/3 answered | 0/3 answered |

What was tried: removing wording that read as concealment ("never mention
steno", "leaves no trace") and adding an explicit legibility rule. That is
better design on its own terms, but did not change the outcome. A short,
published draft-style thinking prompt (Chain of Draft) is accepted, and so is
`steno-lite`, which ships exactly as tested. Steno deliberately does not keep
rewording its rules to get past a safety classifier.

## 3. Eval results

18 task prompts with checkable answers × 2 runs, plus 6 open requests × 1 run
(one in Croatian). Arms are described in `evals/README.md`. "vs control" is
the honest comparison: what steno adds over simply asking for concise
reasoning.

### Haiku 5.5

Thinks on nearly every task (35–36 of 36 calls per arm).

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 2818 | +0% | +13% | 36/36 | 144.0 / 674.5 | 0/42 | 1/1 | 0/42 |
| control | 2491 | -12% | +0% | 36/36 | 133.5 / 736.5 | 0/42 | 1/1 | 0/42 |
| lite | 2704 | -4% | +9% | 36/36 | 115.5 / 668.5 | 0/42 | 1/1 | 0/42 |
| steno | 3820 | +36% | +53% | 36/36 | 126.5 / 586.5 | 0/42 | 1/1 | 0/42 |
| ultrasteno | 3807 | +35% | +53% | 36/36 | 135.0 / 587.5 | 0/42 | 1/1 | 0/42 |

Per prompt: strict steno thought less than baseline on 1 of 18 prompts,
ultrasteno on 0 of 18, lite on 11 of 18. The strict increase is consistent,
not a few outliers. Per-call thinking varies a lot (mean 157, standard
deviation 131 tokens for baseline), so the lite and control differences are
within noise; the strict difference is not.

### Sonnet 5.5

Adaptive thinking rarely engaged on these tasks: baseline thought on 3 of 36
calls, control on 2, lite on 11. Totals cover the 6 prompts where any arm
thought.

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 277 | +0% | +25% | 36/36 | 114.0 / 776.5 | 0/42 | 1/1 | 0/42 |
| control | 222 | -20% | +0% | 36/36 | 125.0 / 777.0 | 0/42 | 1/1 | 0/42 |
| lite | 636 | +130% | +186% | 36/36 | 104.0 / 691.0 | 0/42 | 1/1 | 0/42 |

Lite made Sonnet decide to think more often, which costs more overall.

## 4. What this means

- **Prompting the format of hidden reasoning did not compress it on these
  models.** The most likely reason is that a long, strict specification gives
  the model more to deliberate about. This cannot be confirmed here: the host
  returns thinking token counts but not the thinking text, so the eval
  measures cost and outcome, not whether traces literally follow the dialect.
- **A one-line "keep your reasoning concise" did better than every steno
  mode.** If thinking cost is the goal today, that line, or the host's effort
  and thinking-budget settings, is the practical lever.
- **The per-token findings stand on their own.** They apply anywhere a model
  writes text that is billed: visible reasoning in open-weight models, agent
  scratchpads, notes, and prompts.

## 5. Limits of this evaluation

- One host (Claude Code CLI), one effort level (`high`), 18 tasks, 2 runs.
- Opus 5.5 was only checked for refusals, not for savings.
- Short, self-contained tasks. Long agentic sessions, where the per-turn
  reminder matters, were not measured.
- Reply-length comparisons on open prompts rest on 6 prompts × 1 run.

## Reproduce

```bash
python3 scripts/measure_tokens.py --backend claude-cli --model haiku
python3 scripts/build_lexicon.py --check
python3 evals/run.py --model haiku --runs 2 --out evals/snapshots/haiku-5-5.jsonl
python3 evals/run.py --model sonnet --arms baseline,control,lite --runs 2 --out evals/snapshots/sonnet-5-5.jsonl
python3 evals/report.py evals/snapshots/haiku-5-5.jsonl
```
