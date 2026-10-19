# Contributing

Thanks for helping. Read `CLAUDE.md` first: it has the layout and the rules
for changing the dialect.

## Before you open a pull request

```bash
npm test
python3 scripts/build_lexicon.py --check
```

## Changes to the dialect

Bring numbers. A pull request that adds or changes a notation form should
include the measured token counts (`lexicon/measured.json` diff) and say which
backend and model produced them. A change to rules that shape reasoning should
include an eval run (`evals/run.py`, at least two runs per prompt) with
thinking tokens against both baseline and control, accuracy, reply length,
leaks and refusals.

## What will not be merged

- Rules that skip or shorten reasoning steps or checks.
- Wording that asks a model to hide, disguise or omit what it is reasoning about.
- Rewording aimed at getting past a model's safety safeguards.
- Hand edits to the generated `LEXICON` block.
