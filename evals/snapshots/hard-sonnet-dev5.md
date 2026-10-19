Model `sonnet` via `claude-cli`, 24 task prompts x 1 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 14590 | +0% | +0% |  | 24/24 | 172.5 / None | 0/24 | - | 0/24 |
| u1-cod5 | 0 | -100% | n/a |  | 0/24 | 0.0 / None | 0/24 | - | 24/24 |
| u2-ten | 10825 | -26% | -5% |  | 22/24 | 174.5 / None | 0/24 | - | 1/24 |
| u4-very-plain | 9371 | -36% | -17% |  | 23/24 | 177.0 / None | 0/24 | - | 0/24 |

- u1-cod5 thought less than baseline on 24/24 prompts.
- u2-ten thought less than baseline on 11/24 prompts.
- u4-very-plain thought less than baseline on 15/24 prompts.
