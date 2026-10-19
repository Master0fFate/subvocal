Model `haiku` via `claude-cli`, 24 task prompts x 2 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 38224 | +0% | +29% | 47/48 | 133.5 / None | 3/48 | - | 0/48 |
| control | 29712 | -22% | +0% | 46/48 | 133.0 / None | 1/48 | - | 0/48 |
| lite | 36469 | -5% | +23% | 46/48 | 105.0 / None | 0/48 | - | 0/48 |
| subvocal | 38400 | +0% | +29% | 48/48 | 132.0 / None | 1/48 | - | 0/48 |
| ultrasubvocal | 37920 | -1% | +28% | 46/48 | 140.0 / None | 0/48 | - | 0/48 |
| cod | 32060 | -16% | +8% | 46/48 | 116.0 / None | 0/48 | - | 0/48 |
| concise-strong | 34213 | -10% | +15% | 45/48 | 121.0 / None | 0/48 | - | 0/48 |
| concise-sym | 36252 | -5% | +22% | 47/48 | 118.0 / None | 2/48 | - | 0/48 |
| concise-v2 | 34836 | -9% | +17% | 48/48 | 107.0 / None | 1/48 | - | 0/48 |
| draft | 35076 | -8% | +18% | 47/48 | 115.5 / None | 0/48 | - | 0/48 |
| fewer-words | 34824 | -9% | +17% | 47/48 | 113.5 / None | 4/48 | - | 0/48 |
| lite-v2 | 35588 | -7% | +20% | 47/48 | 124.5 / None | 2/48 | - | 0/48 |
| strict-short | 34346 | -10% | +16% | 46/48 | 114.5 / None | 1/48 | - | 0/48 |
| terse | 38738 | +1% | +30% | 48/48 | 105.5 / None | 2/48 | - | 0/48 |

- control thought less than baseline on 22/24 prompts.
- lite thought less than baseline on 12/24 prompts.
- subvocal thought less than baseline on 9/24 prompts.
- ultrasubvocal thought less than baseline on 8/24 prompts.
- cod thought less than baseline on 21/24 prompts.
- concise-strong thought less than baseline on 19/24 prompts.
- concise-sym thought less than baseline on 19/24 prompts.
- concise-v2 thought less than baseline on 15/24 prompts.
- draft thought less than baseline on 14/24 prompts.
- fewer-words thought less than baseline on 16/24 prompts.
- lite-v2 thought less than baseline on 15/24 prompts.
- strict-short thought less than baseline on 14/24 prompts.
- terse thought less than baseline on 11/24 prompts.
