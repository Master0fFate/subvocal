---
name: steno-lexicon
description: >
  Rebuild steno's measured lexicon for a model: mine the phrases your traces
  repeat, measure candidate notation with the real tokenizer, and regenerate
  the lexicon block in the steno skills. Use for /steno-lexicon, "re-measure
  steno", "tune steno for my model", "update the steno lexicon".
---

# steno-lexicon

Steno's rule is tokens, not characters. This skill re-derives the dialect from measurements whenever the model, the tokenizer, or your workload changes. Run the steps yourself with the shell; ask before any step that spends the user's API credit or subscription.

All commands run from the root of a steno repository clone. If the current directory is not one, ask the user where their clone is.

## 1. Mine what your traces repeat

```bash
python3 scripts/mine_phrases.py --top 50
```

With no paths it reads thinking blocks from the user's Claude Code transcripts (`~/.claude/projects/**/*.jsonl`) and prints only n-gram counts. Pass `.jsonl`, `.txt` or `.md` files to mine other traces. Report the top uncovered phrases.

## 2. Add candidates

For each uncovered phrase worth replacing, add a concept to `lexicon/candidates.json`:

- `english`: the forms models actually write, taken from step 1.
- `notation`: replacements, each tagged `code`, `math` or `ascii`. Prefer code and math idioms: they are in-distribution. Invented abbreviations rarely help.
- `at: "start"` for line openers (`? `, `=> `), omitted for mid-line operators.
- Order candidates by preference: on a token tie, the earlier one wins.

## 3. Measure

Pick one backend and say which:

```bash
python3 scripts/measure_tokens.py --backend anthropic --model <model-id>   # exact, free, needs ANTHROPIC_API_KEY
python3 scripts/measure_tokens.py --backend claude-cli --model haiku        # exact, uses the claude CLI login
python3 scripts/measure_tokens.py --backend tiktoken                        # offline approximation, non-Claude
```

Results are cached in `lexicon/.cache/`, so only new strings cost calls. Each chunk is bracketed by baseline calls and re-measured if the baseline drifts.

## 4. Rebuild

```bash
python3 scripts/build_lexicon.py
python3 scripts/build_lexicon.py --check
```

This rewrites `lexicon/lexicon.json` and the block between the `LEXICON` markers in `skills/steno/SKILL.md` and `skills/ultrasteno/SKILL.md`. Never edit that block by hand.

## 5. Verify

```bash
npm test
python3 evals/run.py --model <model> --runs 2 --out evals/snapshots/<name>.jsonl
python3 evals/report.py evals/snapshots/<name>.jsonl
```

The eval costs real calls: confirm with the user first. Report thinking tokens against both baseline and control, accuracy, reply length, leaks, and refusals. A lexicon change that lowers accuracy is reverted, whatever it saves.
