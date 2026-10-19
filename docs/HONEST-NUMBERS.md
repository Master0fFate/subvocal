# Honest numbers

Everything subvocal claims is measured here, including the results that went
against it. All runs go through Claude Code 2.1.303 (`claude -p`), effort
`high`, isolated calls (empty directory, project-only settings, no tools, no
MCP, fixed system prompt). Raw data: `evals/snapshots/*.jsonl`; one JSON line
per call, replies included.

## Summary

| Claim | Result |
|---|---|
| Fewer thinking tokens with the default mode (`lite`) | **Yes.** On 24 multi-step tasks: Haiku 5.5 **−19%**, Sonnet 5.5 **−18%**, Opus 5.5 **−11%** against no instruction. Fresh runs, after the instruction was chosen. |
| Same accuracy | **Yes.** Haiku 71/72 vs 72/72, Sonnet 48/48 vs 48/48, Opus 24/24 vs 24/24. |
| Reply unchanged | **Mostly.** No notation leaked into any reply, no refusals, and the Croatian question got a Croatian answer in every arm. Task replies moved by a few tokens (Haiku median 121 vs 133, Sonnet 168 vs 164, Opus 215 vs 192). On the 6 open requests, Haiku's median reply was 18% shorter and Sonnet's 8% longer, from one run each, so treat that as noise-level evidence that open replies may drift. |
| Fewer thinking tokens with the strict shorthand dialect | **No.** Strict `subvocal` +5% and `ultrasubvocal` +5% on Haiku, within noise; on the earlier short task set +36%. |
| The dialect's forms are cheaper per token | **Yes.** Every chosen form beats the English it replaces, measured with Claude's tokenizer. Cheaper symbols did not translate into shorter traces. |
| Strict dialect works on every model | **No.** Sonnet 5.5 and Opus 5.5 decline the strict ruleset outright. Lite is accepted by all three. |

So the default is `lite` on every model: one sentence that asks for concise
reasoning and an unchanged reply. The strict dialect stays opt-in for anyone
who wants to experiment with it, with these numbers attached.

## 1. The benchmark that counts: 24 multi-step tasks

`evals/prompts/hard.jsonl`: code tracing, lattice paths with blocked cells,
logic grids, knights and knaves, modular exponentiation, digit sums, Dijkstra,
Game of Life, look-and-say, inclusion-exclusion, dice probability, popcount, a
robot walk, a stack machine, interval unions, Collatz, a binary search tree, a
tank-filling rate problem, string rounds and hex arithmetic. Each has one
checkable answer, computed by a script. Haiku thinks for roughly 300 to 7000
tokens on each, the regime an instruction about thinking can move at all.

Arms were interleaved per prompt so that time-of-day effects hit every arm
alike. Confidence intervals are bootstrap over prompts (2000 resamples of the
24 prompts, per-prompt means across runs).

### Confirmation runs (fresh, with the shipped text)

![thinking tokens per arm on Haiku, Sonnet and Opus](benchmark.svg)

| Model | Runs | Arm | Thinking tokens | vs baseline | 95% CI | Prompts with less thinking | Accuracy | Total output tokens | Leaks | Refused |
|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 24 × 3 | baseline | 39205 | | | | 72/72 | | 0 | 0 |
| | | **lite** | 31810 | **−19%** | −30% to −1% | 18/24 | 71/72 | −19% | 0 | 0 |
| | | subvocal (strict) | 40987 | +5% | −12% to +26% | 6/24 | 72/72 | +4% | 0 | 0 |
| | | ultrasubvocal | 41019 | +5% | −16% to +33% | 6/24 | 72/72 | +5% | 0 | 0 |
| Sonnet 5.5 | 24 × 2 | baseline | 13632 | | | | 48/48 | | 0 | 0 |
| | | **lite** | 11244 | **−18%** | −29% to −0.3% | 17/24 | 48/48 | −12% | 0 | 0 |
| Opus 5.5 | 24 × 1 | baseline | 8385 | | | | 24/24 | | 0 | 0 |
| | | **lite** | 7478 | **−11%** | −23% to +0.4% | 17/24 | 24/24 | −4% | 0 | 0 |

The one wrong answer in the lite arm on Haiku is `collatz-1161` (181 steps by
hand), which every arm got wrong at least once in the development run, the
baseline included. Opus has one run, so its interval just touches zero; the
direction matches the other two models on 17 of 24 prompts.

Snapshots: `hard-haiku-5-5.jsonl`, `hard-sonnet-5-5.jsonl`,
`hard-opus-5-5.jsonl`, each with a `.md` report next to it.

### How the instruction was chosen (development run)

Haiku 5.5, 24 tasks × 2 runs, 14 arms. The confirmation table above was run
afterwards, on fresh calls, so the choice is not fitted to the numbers it
reports. Snapshot: `hard-haiku-dev.jsonl`.

| Arm | What it adds to the system prompt | Chars | Thinking vs baseline | 95% CI | Accuracy |
|---|---|---|---|---|---|
| baseline | nothing | 0 | | | 47/48 |
| **control** | "Keep your internal reasoning concise. Your reply is unaffected: write it as you normally would." | 95 | **−22%** | −31% to −16% | 46/48 |
| cod | Chain-of-Draft wording: minimum draft per step, 5 words at most | 148 | −16% | −25% to −7% | 46/48 |
| concise-strong | "as brief as possible while still doing every step" | 170 | −11% | −22% to 0% | 45/48 |
| strict-short | the strict dialect condensed to 1 KB | 1069 | −10% | −21% to +2% | 46/48 |
| concise-v2 | control plus "do not restate the problem or narrate" | 237 | −9% | −20% to +2% | 48/48 |
| fewer-words | "as few words as possible, short lines, no filler" | 155 | −9% | −17% to −1% | 47/48 |
| draft | control plus compact notation and one-letter aliases | 399 | −8% | −20% to +1% | 47/48 |
| lite-v2 | the old lite text with a ten-word limit per step | 369 | −7% | −19% to +3% | 47/48 |
| concise-sym | control plus "use a symbol where it is shorter" | 177 | −5% | −25% to +22% | 47/48 |
| lite (old) | short draft steps, cheapest notation, one-letter names | 472 | −5% | −23% to +11% | 46/48 |
| terse | "terse shorthand: short lines, symbols over words" | 205 | +1% | −14% to +15% | 48/48 |
| subvocal (strict) | the full ruleset plus per-turn reminder | 11908 | +0.5% | −7% to +10% | 48/48 |
| ultrasubvocal | the full ultra ruleset plus reminder | 18979 | −1% | −13% to +14% | 46/48 |

The pattern is consistent: the single sentence asking for concise reasoning
saved the most, and every addition to it, whether symbols, aliases, line
formats or the full dialect, gave some of the saving back. The control
sentence therefore became the shipped `lite` text, and the confirmation runs
above measure it exactly as the hooks inject it.

## 2. Token costs (the lexicon)

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

These findings stand on their own. They apply anywhere a model writes text
that is billed: visible reasoning in open-weight models, agent scratchpads,
notes, and prompts. They did not make the strict dialect cheaper in practice,
because asking a model to follow a notation spec gave it more to deliberate
about than the notation saved.

## 3. Model support (refusals)

With the strict ruleset in the system prompt, the safeguards on Sonnet 5.5 and
Opus 5.5 decline every request (`stop_reason: refusal`), including "What is
17×23?". Haiku 5.5 answers normally. Lite is accepted by all three, on every
call in every run.

| Model | lite (the shipped sentence) | subvocal (strict) | ultrasubvocal |
|---|---|---|---|
| Haiku 5.5 | 168/168 answered | 168/168 answered | 168/168 answered |
| Sonnet 5.5 | 96/96 answered | 0/3 answered | 0/3 answered |
| Opus 5.5 | 24/24 answered | 0/3 answered | 0/3 answered |

The lite column counts every call of the shipped sentence across all
snapshots, including the runs where it was still labelled `control`.

Removing wording that read as concealment ("never mention subvocal", "leaves
no trace") and adding an explicit legibility rule did not change the strict
outcome. Since the strict dialect also measured no saving, nothing in the
default path depends on it.

## 4. Earlier results: 18 short tasks

The first eval used `evals/prompts/tasks.jsonl`, where Haiku thinks about 150
tokens per task. On that set the strict modes cost **+36%** thinking tokens
(3820 vs 2818 over 18 × 2 calls), the old lite −4%, the control sentence
−12%, all at 36/36 accuracy with no leaks. Sonnet thought on only 3 of 36
baseline calls there, so that set says little about Sonnet. Snapshots:
`haiku-5-5.jsonl`, `sonnet-5-5.jsonl`, `refusals-*.jsonl`. Those files keep
their arm names; `lite` in them is the old five-line text, not the shipped one.

## 5. Limits of this evaluation

- One host (Claude Code CLI), one effort level (`high`), 24 tasks. Opus has a
  single run.
- Short, self-contained prompts. Long agentic sessions were not measured, and
  that is where most thinking tokens are spent in practice.
- The host returns thinking token counts but not the thinking text, so the
  eval measures cost and outcome, not what the trace looks like.
- Reply-length comparisons on open prompts rest on 6 prompts × 1 run.

## Reproduce

```bash
python3 scripts/measure_tokens.py --backend claude-cli --model haiku
python3 scripts/build_lexicon.py --check
python3 evals/run.py --model haiku --sets hard,open --runs 3 --arms baseline,lite,subvocal,ultrasubvocal --out evals/snapshots/hard-haiku-5-5.jsonl
python3 evals/run.py --model sonnet --sets hard,open --runs 2 --arms baseline,lite --out evals/snapshots/hard-sonnet-5-5.jsonl
python3 evals/run.py --model opus --sets hard --runs 1 --arms baseline,lite --out evals/snapshots/hard-opus-5-5.jsonl
python3 evals/report.py evals/snapshots/hard-haiku-5-5.jsonl
python3 evals/chart.py evals/snapshots/hard-haiku-5-5.jsonl evals/snapshots/hard-sonnet-5-5.jsonl evals/snapshots/hard-opus-5-5.jsonl --out docs/benchmark.svg
```
