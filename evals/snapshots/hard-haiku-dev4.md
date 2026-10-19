Model `haiku` via `claude-cli`, 24 task prompts x 2 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 37110 | +0% | +0% |  | 48/48 | 128.5 / None | 0/48 | - | 0/48 |
| draft | 29904 | -19% | -20% |  | 48/48 | 111.5 / None | 0/48 | - | 0/48 |
| u1-cod5 | 30762 | -17% | -15% |  | 48/48 | 121.0 / None | 1/48 | - | 0/48 |
| u2-ten | 29656 | -20% | -19% |  | 47/48 | 109.5 / None | 0/48 | - | 0/48 |
| u3-very | 24978 | -33% | -29% |  | 48/48 | 105.5 / None | 0/48 | - | 0/48 |
| u4-very-plain | 25428 | -31% | -24% |  | 48/48 | 123.0 / None | 0/48 | - | 0/48 |

- draft thought less than baseline on 21/24 prompts.
- u1-cod5 thought less than baseline on 20/24 prompts.
- u2-ten thought less than baseline on 20/24 prompts.
- u3-very thought less than baseline on 21/24 prompts.
- u4-very-plain thought less than baseline on 22/24 prompts.
