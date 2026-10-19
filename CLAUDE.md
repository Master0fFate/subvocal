# Working on subvocal

Subvocal asks a model to keep its reasoning concise while the reply stays
normal prose. This file is for anyone (person or agent) changing this
repository.

## Layout

```
skills/subvocal/SKILL.md        default mode: one measured sentence
skills/ultrasubvocal/SKILL.md   more aggressive mode: minimum draft per thinking step
skills/subvocal-lexicon/        skill that re-runs the lexicon pipeline
lexicon/candidates.json      concepts, English forms, notation candidates
lexicon/measured.json        real token counts (generated)
lexicon/lexicon.json         chosen dialect + every number behind it (generated)
scripts/mine_phrases.py      find phrases traces repeat
scripts/measure_tokens.py    measure strings with a real tokenizer
scripts/build_lexicon.py     choose forms, write lexicon.json + the DIALECT.md block
src/hooks/                   Claude Code / Codex / Cursor / Copilot hooks (Node, zero deps)
installer/install.js         standalone Claude Code install (no marketplace)
evals/                       thinking-token, accuracy and reply-unchanged eval
docs/                        dialect research doc, honest numbers, model support
tests/                       node:test for hooks, unittest for pipeline + scoring
```

## Rules for changing the dialect

The dialect is a research artifact and no mode injects it. It lives in
`docs/DIALECT.md`; the two modes are plain English in their skill files.

1. Never edit the block between `<!-- LEXICON:BEGIN` and `<!-- LEXICON:END -->`
   by hand. Change `lexicon/candidates.json`, run
   `scripts/measure_tokens.py`, then `scripts/build_lexicon.py`.
2. A notation form is kept only when it is strictly cheaper than the median
   English form it replaces. Ties go to plain English.
3. Prefer code and math idioms over invented abbreviations.
4. No rule may remove a reasoning step, check or case. The dialect compresses
   encoding, not content.
5. No wording that asks the model to hide, disguise or omit reasoning. A test
   fails if concealment wording appears in injected text.

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
