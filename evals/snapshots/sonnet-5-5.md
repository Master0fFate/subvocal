Model `sonnet` via `claude-cli`, 18 task prompts x 2 run(s). Thinking totals use the 6 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 277 | +0% | +25% | 36/36 | 114.0 / 776.5 | 0/42 | 1/1 | 0/42 |
| control | 222 | -20% | +0% | 36/36 | 125.0 / 777.0 | 0/42 | 1/1 | 0/42 |
| lite | 636 | +130% | +186% | 36/36 | 104.0 / 691.0 | 0/42 | 1/1 | 0/42 |

- lite thought less than baseline on 0/6 prompts.
