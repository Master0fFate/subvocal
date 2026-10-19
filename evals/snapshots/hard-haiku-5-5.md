Model `haiku` via `claude-cli`, 24 task prompts x 3 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 39205 | +0% |  | 72/72 | 132.5 / 498.0 | 0/78 | 1/1 | 0/78 |
| lite | 31810 | -19% |  | 71/72 | 121.0 / 407.0 | 0/78 | 1/1 | 0/78 |
| subvocal | 40987 | +5% |  | 72/72 | 135.0 / 473.5 | 0/78 | 1/1 | 0/78 |
| ultrasubvocal | 41019 | +5% |  | 72/72 | 151.0 / 528.5 | 0/78 | 1/1 | 0/78 |

- lite thought less than baseline on 18/24 prompts.
- subvocal thought less than baseline on 6/24 prompts.
- ultrasubvocal thought less than baseline on 6/24 prompts.
