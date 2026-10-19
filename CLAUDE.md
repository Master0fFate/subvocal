# Working on subvocal

Subvocal compresses a model's reasoning into measured shorthand while the reply
stays normal prose. This file is for anyone (person or agent) changing this
repository.

## Layout

```
skills/subvocal/SKILL.md        strict mode: the full dialect, opt-in
skills/ultrasubvocal/SKILL.md   tighter variant, layered on subvocal
skills/subvocal-lite/SKILL.md   light mode: one measured instruction, the default everywhere
skills/subvocal-lexicon/        skill that re-runs the lexicon pipeline
lexicon/candidates.json      concepts, English forms, notation candidates
lexicon/measured.json        real token counts (generated)
lexicon/lexicon.json         chosen dialect + every number behind it (generated)
scripts/mine_phrases.py      find phrases traces repeat
scripts/measure_tokens.py    measure strings with a real tokenizer
scripts/build_lexicon.py     choose forms, write lexicon.json + the skill block
src/hooks/                   Claude Code / Codex / Cursor / Copilot hooks (Node, zero deps)
installer/install.js         standalone Claude Code install (no marketplace)
evals/                       thinking-token, accuracy and reply-unchanged eval
docs/                        dialect spec, honest numbers, model support
tests/                       node:test for hooks, unittest for pipeline + scoring
```

## Rules for changing the dialect

1. Never edit the block between `<!-- LEXICON:BEGIN` and `<!-- LEXICON:END -->`
   by hand. Change `lexicon/candidates.json`, run
   `scripts/measure_tokens.py`, then `scripts/build_lexicon.py`.
2. A notation form is kept only when it is strictly cheaper than the median
   English form it replaces. Ties go to plain English.
3. Prefer code and math idioms over invented abbreviations.
4. No rule may remove a reasoning step, check or case. Subvocal compresses
   encoding, not content.
5. No wording that asks the model to hide, disguise or omit reasoning. The
   legibility rule (rule 11 in `skills/subvocal/SKILL.md`) is load-bearing, and
   a test fails if concealment wording appears in injected text.

## Checks

```bash
npm test                                   # node + python tests
python3 scripts/build_lexicon.py --check   # generated block is current
python3 evals/run.py --dry-run --out /tmp/plan.jsonl
```

Real evals cost API calls or subscription usage; see `evals/README.md`.

## Hooks

- All hooks fail open: any error prints nothing and exits 0.
- Never `process.exit()` after writing stdout (pipes are async).
- One `hookSpecificOutput` per run.
- Mode state: `$CLAUDE_CONFIG_DIR/.subvocal/sessions/<session_id>`.
