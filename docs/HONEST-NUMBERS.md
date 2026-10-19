# Honest numbers

Everything subvocal claims is measured here, including the results that went
against it. All runs go through Claude Code 2.1.303 (`claude -p`), effort
`high`, isolated calls (empty directory, project-only settings, no tools, no
MCP, fixed system prompt). Raw data: `evals/snapshots/*.jsonl`; one JSON line
per call, replies included.

## Summary

| Claim | Result |
|---|---|
| Fewer thinking tokens, default mode (`subvocal`) | **Yes.** Fresh runs on 24 multi-step tasks: Haiku 5.5 **−16%**, Sonnet 5.5 **−10%**, Opus 5.5 **−17%** on the sum against no instruction. The Haiku and Opus intervals exclude zero; Sonnet's does not (it thinks far less on these tasks, so two runs are noisy). |
| Fewer thinking tokens, `ultrasubvocal` | **Yes, more.** Haiku **−24%**, Sonnet **−7%**, Opus **−18%**; intervals exclude zero on Haiku and Opus; thinks less than baseline on 22, 17 and 22 of 24 prompts. |
| Same accuracy | **Yes for the default:** 96/96, 47/48, 48/48 against 95/96, 48/48, 48/48. **Nearly for ultra:** 93/96 on Haiku (two extra misses), 48/48, 48/48. |
| Reply unchanged | **Mostly.** No notation in any reply, the Croatian question answered in Croatian in every arm. Task replies a few tokens shorter; open replies moved −22% to +17% on 6 prompts × 1 run, which is noise-level evidence that open replies may drift. |
| No refusals | **Yes.** Neither shipped text has been refused on any call: 198 / 54 / 48 calls for `subvocal` and 150 / 78 / 72 for `ultrasubvocal` on Haiku / Sonnet / Opus. Three rejected candidates were refused, see section 1. |
| The 0.1 shorthand dialect | **Retired.** It measured +36% on short tasks, +5% on these, and Sonnet and Opus decline it. Its per-token lexicon stands and lives in DIALECT.md. |

## 1. The benchmark that counts: 24 multi-step tasks

`evals/prompts/hard.jsonl`: code tracing, lattice paths with blocked cells,
logic grids, knights and knaves, modular exponentiation, digit sums, Dijkstra,
Game of Life, look-and-say, inclusion-exclusion, dice probability, popcount, a
robot walk, a stack machine, interval unions, Collatz, a binary search tree, a
tank-filling rate problem, string rounds and hex arithmetic. Each has one
checkable answer, computed by a script. Haiku thinks for roughly 300 to 7000
tokens on each, the regime an instruction about thinking can move at all.

Arms are interleaved per prompt so that time-of-day effects hit every arm
alike. Two statistics are reported for thinking tokens:

- **Sum over the task set**, which is what a user pays. Its 95% interval is a
  bootstrap over prompts (2000 resamples of the 24 prompts, per-prompt means
  across runs). Thinking has a heavy tail: one Game of Life call can run to
  20 000 tokens, so with two runs a single call can flip the sign of the sum.
- **Geometric mean of the per-prompt ratio** against baseline, which says
  what a typical prompt sees and which one long call cannot move.

### Confirmation runs (fresh, with the shipped texts)

![thinking tokens per mode on Haiku, Sonnet and Opus](benchmark.svg)

| Model | Runs | Arm | Thinking tokens | Sum vs baseline | 95% CI | Per prompt (geomean) | Prompts with less thinking | Accuracy | Total output tokens | Refused |
|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 | 24 × 4 | baseline | 38005 | | | | | 95/96 | | 0 |
| | | plain (0.1 default) | 32652 | −14% | −24% to −7% | −17% | 21/24 | 95/96 | −13% | 0 |
| | | **subvocal** | 32056 | **−16%** | −25% to −9% | −19% | 21/24 | 96/96 | −15% | 0 |
| | | **ultrasubvocal** | 28990 | **−24%** | −33% to −16% | −26% | 22/24 | 93/96 | −23% | 0 |
| Sonnet 5.5 | 24 × 2 | baseline | 12947 | | | | | 48/48 | | 0 |
| | | plain (0.1 default) | 13354 | +3% | −6% to +19% | +4% | 12/24 | 48/48 | +2% | 0 |
| | | **subvocal** | 11594 | **−10%** | −32% to +18% | −3% | 13/24 | 47/48 | −10% | 0 |
| | | **ultrasubvocal** | 12092 | **−7%** | −12% to +2% | −3% | 17/24 | 48/48 | −6% | 0 |
| Opus 5.5 | 24 × 2 | baseline | 10090 | | | | | 48/48 | | 0 |
| | | plain (0.1 default) | 9083 | −10% | −21% to +3% | −6% | 17/24 | 48/48 | −4% | 0 |
| | | **subvocal** | 8416 | **−17%** | −24% to −11% | −21% | 21/24 | 48/48 | −4% | 0 |
| | | **ultrasubvocal** | 8238 | **−18%** | −25% to −9% | −17% | 22/24 | 48/48 | −7% | 0 |

`plain` is the 0.1 default sentence ("Keep your internal reasoning
concise."), run side by side so the switch to the draft wording is measured,
not assumed. In its own 0.1 confirmation (`hard-*-5-5.jsonl`, 3 / 2 / 1 runs)
it did −19% / −18% / −11%; here −14% / +3% / −10%. Sonnet is the noisy one:
it thinks a third as much as Haiku on these tasks, so its two-run sums swing
by ±15 points between batches, and only the per-prompt win counts (17 of 24
for ultra) say much. The one wrong answer in the Haiku `subvocal` column of
the 0.1 run and the two extra misses of `ultrasubvocal` here are `collatz-1161`
(181 steps by hand) and `bst`; every arm has missed `collatz-1161` at least
once across the runs, the baseline included.

The files also carry a `u3-very` arm, the first ultra candidate, which is
reported under round 4 below because Sonnet and Opus refused it.

Snapshots: `v2-hard-haiku-5-5.jsonl`, `v2-hard-sonnet-5-5.jsonl`,
`v2-hard-opus-5-5.jsonl`, each with a `.md` report next to it.

### How the texts were chosen

Three development rounds on Haiku 5.5, 24 tasks × 2 runs each. Every candidate
is a system-prompt addition; `subvocal`-mode arms are produced by the hook
code, the rest were passed with `--arm-file`. Snapshots: `hard-haiku-dev.jsonl`
(rounds 1 and 2), `hard-haiku-dev3.jsonl` (round 3).

**Rounds 1 and 2: notation against plain brevity.**

| Arm | What it adds to the system prompt | Chars | Sum vs baseline | 95% CI | Accuracy |
|---|---|---|---|---|---|
| baseline | nothing | 0 | | | 47/48 |
| **control** | "Keep your internal reasoning concise. Your reply is unaffected: write it as you normally would." | 95 | **−22%** | −31% to −16% | 46/48 |
| cod | Chain-of-Draft wording: minimum draft per step, 5 words at most | 148 | −16% | −25% to −7% | 46/48 |
| concise-strong | "as brief as possible while still doing every step" | 170 | −11% | −22% to 0% | 45/48 |
| strict-short | the shorthand dialect condensed to 1 KB | 1069 | −10% | −21% to +2% | 46/48 |
| concise-v2 | control plus "do not restate the problem or narrate" | 237 | −9% | −20% to +2% | 48/48 |
| fewer-words | "as few words as possible, short lines, no filler" | 155 | −9% | −17% to −1% | 47/48 |
| draft | control plus compact notation and one-letter aliases | 399 | −8% | −20% to +1% | 47/48 |
| lite-v2 | the 0.1 lite text with a ten-word limit per step | 369 | −7% | −19% to +3% | 47/48 |
| concise-sym | control plus "use a symbol where it is shorter" | 177 | −5% | −25% to +22% | 47/48 |
| lite (0.1) | short draft steps, cheapest notation, one-letter names | 472 | −5% | −23% to +11% | 46/48 |
| terse | "terse shorthand: short lines, symbols over words" | 205 | +1% | −14% to +15% | 48/48 |
| dialect (strict) | the full 0.1 ruleset plus per-turn reminder | 11908 | +0.5% | −7% to +10% | 48/48 |
| dialect (ultra) | the full 0.1 ultra ruleset plus reminder | 18979 | −1% | −13% to +14% | 46/48 |

Every addition of notation, aliases or line formats to the plain sentence
gave some of the saving back. The plain sentence became the `subvocal` mode.

**Round 3: variants and combinations of the plain sentence.** The shipped
sentence was re-run in the same batch as `c0-control` so the comparison is
fair. This batch also shows the heavy tail: on `life-4` the control arm drew
one 20 462-token call, which alone pushed its sum from a saving to +7% while
21 of 24 prompts still thought less than baseline.

| Arm | Text | Sum vs baseline | 95% CI | Per prompt (geomean) | Prompts with less thinking | Accuracy |
|---|---|---|---|---|---|---|
| baseline | nothing | | | | | 48/48 |
| **c3-concise-draft** | control + "a minimum draft per step, a few words each" | **−14%** | −26% to −4% | −21% | 20/24 | 48/48 |
| c9-short | "Keep your internal reasoning short." | −8% | −27% to +15% | −19% | 19/24 | 47/48 |
| c2-very | "Keep your internal reasoning very concise." | −7% | −29% to +10% | −23% | 21/24 | 48/48 |
| c7-direct | "concise and direct" | −5% | −20% to +9% | −15% | 18/24 | 47/48 |
| c8-scratch | "Your thinking is private scratch work: keep it concise and skip the narration." | −2% | −27% to +19% | −21% | 21/24 | 48/48 |
| c5-norepeat | control + "do not repeat yourself" | 0% | −22% to +21% | −18% | 20/24 | 48/48 |
| c4-fewest | "in the fewest words that still cover every step and check" | +3% | −21% to +21% | −14% | 19/24 | 48/48 |
| c6-draft-concise | Chain-of-Draft sentence + control | +5% | −22% to +27% | −16% | 19/24 | 46/48 |
| c1-brief | "Keep your internal reasoning brief." | +7% | −29% to +34% | −19% | 20/24 | 48/48 |
| c0-control | the shipped `subvocal` sentence | +7% | −31% to +62% | −20% | 21/24 | 48/48 |

Per prompt, every short variant lands between −14% and −23%: the wording
barely matters, the brevity ask does. `c3-concise-draft` had the best sum,
the only interval in the round that excluded zero, perfect accuracy and a
per-prompt saving as good as any. In the confirmation runs above, where
both texts ran side by side as `plain` and `subvocal`, it was also the more
consistent one across the three models, so it became the default `subvocal`
text and the plain sentence was retired.

**Round 4: a stronger text for `ultrasubvocal`.** Haiku 5.5, 24 tasks × 2
runs, the draft sentence re-run as the reference. Snapshot:
`hard-haiku-dev4.jsonl`.

| Arm | Text | Haiku sum | 95% CI | Haiku geomean | Accuracy | Sonnet (1 run) | Opus (1 run) | Refused (Haiku / Sonnet / Opus) |
|---|---|---|---|---|---|---|---|---|
| baseline | nothing | | | | 48/48 | | | 0 / 0 / 0 |
| draft | the `subvocal` sentence | −19% | −28% to −10% | −20% | 48/48 | | | 0 / 0 / 0 |
| u1-cod5 | Chain-of-Draft: "minimum draft for each thinking step, with 5 words at most" | −17% | −25% to −6% | −15% | 48/48 | refused | −25% | 0 / **24 of 24** / 1 of 24 |
| u2-ten | draft with "at most ten words each" | −20% | −25% to −13% | −19% | 47/48 | −26% | +4% | 0 / 1 of 24 / 0 |
| u3-very | draft with "very concise" and "nothing else" | −33% | −44% to −19% | −29% | 48/48 | −5% | −34% | 0 / 3 of 54 / 5 of 48 |
| **u4-very** | "Keep your internal reasoning very concise: a minimum draft per step, a few words each." | **−31%** | −43% to −18% | −24% | 48/48 | −36% | −21% | 0 / 0 / 0 |

Snapshots: `hard-haiku-dev4.jsonl`, `hard-sonnet-dev5.jsonl`,
`hard-opus-dev5.jsonl`; the `u3-very` Sonnet and Opus figures are its arm
in the v2 confirmation files, where it was first tried as the ultra mode.

Two findings here matter beyond this project. The published Chain-of-Draft
prompt is refused on every call by Sonnet 5.5, and any hard cap or "nothing
else" clause draws occasional refusals from Sonnet or Opus, while the same
request without a cap is accepted everywhere. And on Haiku the cap bought
nothing: `u4-very` without one saved as much as `u3-very` with one. `u4-very`
became `ultrasubvocal`.

## 2. Token costs (the lexicon)

`scripts/measure_tokens.py --backend claude-cli --model haiku`: each string is
sent inside a fixed probe (`a <s> b`, or at line start for markers) and its
cost is the difference in reported input tokens against the bare probe. Each
chunk of strings is bracketed by two baseline calls and re-measured if they
disagree, because the CLI's injected context can shift between calls. Sanity
anchors: `the` = 1 token, `the the the` = 3. A spot check of five strings on
`claude-opus-5-5` gave identical counts.

Highlights (full data in `lexicon/lexicon.json`, the generated table in
`docs/DIALECT.md`):

- `→` and `=>` cost 1 token; `->` costs 2; `∴ ≠ ≥ ≤ ≈ ∀ ∃ ∈ ∅ ✓ ✗ ¬ ∧ ∨` cost 4 each.
- `true`/`false` cost 1; `ok`/`yes` cost 2; `✓`/`✗` cost 4.
- `because` and `about` cost 1 and beat every abbreviation (`b/c` 3, `~` 3).
- One capital letter as an alias costs 1 token; `C1`-style aliases cost 3.
- The same three sentences cost +55% in Croatian, +97% in German and +47% in
  Spanish compared with English.

These findings stand on their own. They apply anywhere a model writes text
that is billed: visible reasoning in open-weight models, agent scratchpads,
notes, and prompts. They did not make the dialect cheaper in practice,
because asking a model to follow a notation spec gave it more to deliberate
about than the notation saved.

## 3. Refusals

With the 0.1 dialect ruleset in the system prompt, the safeguards on Sonnet
5.5 and Opus 5.5 declined every request (`stop_reason: refusal`), including
"What is 17×23?". Haiku 5.5 answered normally. Neither shipped mode has ever
been refused.

| Text | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| `subvocal` (shipped) | 198/198 answered | 54/54 answered | 48/48 answered |
| `ultrasubvocal` (shipped) | 150/150 answered | 78/78 answered | 72/72 answered |
| plain 0.1 sentence | 318/318 answered | 150/150 answered | 72/72 answered |
| Chain-of-Draft, "5 words at most" (rejected) | 96/96 answered | **0/24 answered** | 23/24 answered |
| draft + "nothing else" (rejected) | 150/150 answered | 51/54 answered | 43/48 answered |
| draft + "at most ten words" (rejected) | 48/48 answered | 23/24 answered | 24/24 answered |
| 0.1 dialect, strict and ultra | 336/336 answered | 0/6 answered | 0/6 answered |

Counts cover every call of each text across all snapshots, including the
development runs. Both shipped texts are shown exactly as the hooks inject
them.

## 4. Earlier results: the 0.1 dialect

On the first eval set (`evals/prompts/tasks.jsonl`, 18 short tasks where
Haiku thinks about 150 tokens each) the dialect modes cost **+36%** thinking
tokens, the 0.1 lite text −4%, and the plain sentence −12%, all at 36/36
accuracy. On the 24-task set, in fresh runs (`hard-haiku-5-5.jsonl`, 3 runs),
the dialect cost +5% and the plain sentence (there labelled `lite`) saved 19%.
Sonnet −18% and Opus −11% in the same confirmation (`hard-sonnet-5-5.jsonl`,
`hard-opus-5-5.jsonl`). In those files `subvocal`/`ultrasubvocal` are the
dialect arms and `lite` is the sentence now shipped as `subvocal`.

## 5. Limits of this evaluation

- One host (Claude Code CLI), one effort level (`high`), 24 tasks.
- Short, self-contained prompts. Long agentic sessions were not measured, and
  that is where most thinking tokens are spent in practice.
- The host returns thinking token counts but not the thinking text, so the
  eval measures cost and outcome, not what the trace looks like.
- Reply-length comparisons on open prompts rest on 6 prompts × 1 run.
- Thinking length has a heavy tail. Sums over 24 prompts × 2 runs move by
  ±10 points between identical batches; the geometric mean is steadier.

## Reproduce

```bash
python3 scripts/measure_tokens.py --backend claude-cli --model haiku
python3 scripts/build_lexicon.py --check
python3 evals/run.py --model haiku --sets hard,open --runs 4 --arms baseline,subvocal,ultrasubvocal --out evals/snapshots/v2-hard-haiku-5-5.jsonl
python3 evals/run.py --model sonnet --sets hard,open --runs 2 --arms baseline,subvocal,ultrasubvocal --out evals/snapshots/v2-hard-sonnet-5-5.jsonl
python3 evals/run.py --model opus --sets hard --runs 2 --arms baseline,subvocal,ultrasubvocal --out evals/snapshots/v2-hard-opus-5-5.jsonl
python3 evals/report.py evals/snapshots/v2-hard-haiku-5-5.jsonl
python3 evals/chart.py evals/snapshots/v2-hard-haiku-5-5.jsonl evals/snapshots/v2-hard-sonnet-5-5.jsonl evals/snapshots/v2-hard-opus-5-5.jsonl --out docs/benchmark.svg
```
