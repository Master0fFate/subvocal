Model `opus` via `claude-cli`, 24 task prompts x 2 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 10090 | +0% | +0% |  | 48/48 | 181.5 / None | 0/48 | - | 0/48 |
| plain | 9083 | -10% | -6% |  | 48/48 | 214.5 / None | 1/48 | - | 0/48 |
| subvocal | 8416 | -17% | -21% |  | 48/48 | 199.0 / None | 0/48 | - | 0/48 |
| ultrasubvocal | 8238 | -18% | -17% |  | 48/48 | 206.5 / None | 0/48 | - | 0/48 |
| u3-very | 6688 | -34% | -21% |  | 43/48 | 165.5 / None | 0/48 | - | 5/48 |

- plain thought less than baseline on 17/24 prompts.
- subvocal thought less than baseline on 21/24 prompts.
- ultrasubvocal thought less than baseline on 22/24 prompts.
- u3-very thought less than baseline on 18/24 prompts.
