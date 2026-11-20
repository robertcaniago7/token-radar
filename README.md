# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/robertcaniago7/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/robertcaniago7/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for the [make.fun token-radar-01 bounty](https://make.fun/bounty/token-radar-01) — "Build the best token launch radar".

A token launch radar: it ranks the pre-token DeFi protocols in the sealed DefiLlama snapshot by
implied launch value, and hands each one a costed farm plan — plus one data-derived reason to
farm it.

## The model (radar-3)

Implied value is a power law **fitted at run time to the live tokens in the snapshot** — not a
multiple carried in, and no protocol name is special-cased:

```
log(market cap) = 6.9646 + 0.5223 * log(TVL)
```

Fitted on the 128 live tokens with both a market cap and TVL above zero (R² 0.194). Five-fold
backtest on those same tokens: median error ×3.49 on seed 42, ×3.63 across five seeds (range
×3.49–×3.78), 32% of predictions within 2×, 44% within 3×. The dashboard draws the fit as a
scatter of the live tokens against the curve, so the error is visible, not just stated.

Why the curve stays a single-variable power law: every extra regressor was tested on the live
tokens — log age, log chain count, seven-day growth, category dummies, a quadratic term. The
full 13-parameter model lifted in-sample R² to 0.269, but its adjusted R² barely moved (0.188
to 0.193) and its 5-fold cross-validation median error did not improve across five seeds
(×2.93–×4.16, against the power law's ×3.28–×3.77). The extra parameters were overfitting,
not signal, so radar-3 keeps the honest two-parameter curve and reports the backtest across
five seeds instead of one.

Each protocol's implied value then adjusts for what the snapshot records about it:

```
implied = round( exp(6.9646) * tvl_usd ^ 0.5223
               * (1 + clamp(change_7d, -60, 120) / 100 * 0.5)
               * (0.6 + min(age_days, 1095) / 1095 * 0.4) )
```

Growth is the seven-day TVL change, capped so a single week cannot dominate. Age is the time
since the protocol was first listed — the best record of how long it has run with no token — and
an unlisted age uses 365 days. Every constant is in `lib/model.ts`, and the dashboard recomputes
each row from the same arithmetic, so the page and `board.json` agree.

## What is ranked, and what is not

The snapshot holds 758 protocols at or above $5M TVL, 40 of them on the watchlist. Before
ranking, wrapped, staked and bridged products of tokens that already trade are excluded
(categories Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX;
versioned names; whole words wrapped / staked / staking; exchange prefixes). That leaves
**198 rankable protocols: the 40 watchlist protocols plus 158 early-stage ones**. The 24
protocols with a live token are set aside and shown on the dashboard's Live token tab — their
market cap is a fact, not a model.

The #1 is Steakhouse Financial at $71.2M implied on $2.75B TVL. Total implied value across the
board is $1.73B.

## Farm plans

Every row carries a six-step farm plan with a deposit sized to TVL ($50–$250), a hold sized to
age (30–60 days), and gas and time counted. The economics assume 10% of the implied value
reaches the community, one farmer takes deposit / (deposit + $1,000,000) of it, and the chance
the token launches and the farmer qualifies is 0.35. Net $/hour decides the verdict: Farm at
$100/h or more, Thin at $20–$100/h, Skip below $20/h. The board comes out 5 Farm, 27 Thin,
166 Skip — most small protocols are not worth the gas, and the board says so.

Each row also carries one **edge** sentence, derived from the board itself — its TVL rank
inside its category, its seven-day growth against the board, or its age with no token — so the
detail view says why this protocol, not just what to do.

## The dashboard

A static page (41 KB of source, no network): a top-ten spotlight, a verdict mix and category
breakdown, a sortable and filterable board, a per-protocol detail view with the model's own
inputs and the farm plan, a live-token tab, a scatter of the fitted curve against the live
tokens, and a model sandbox that recomputes implied values from your sliders.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22+, standard library only, no network. It reads the snapshot, writes `board.json` and
`data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json` with
the vendored make.fun library. The same snapshot always writes the same bytes — run it twice
and `diff -r` the outputs.

## Files

- `main.ts` — the program. Reads the snapshot, fits the model, writes the board and dossier.
- `lib/model.ts` — the model: snapshot parsing, the fitted power law, the five-seed backtest,
  the board builder with per-row edges, the farm economics, and the gate checks.
- `vendor/makefun-board.ts` — the make.fun dossier library, byte for byte from the kit.
- `dashboard/` — the static page (index.html, app.js, app.css). Spotlight, breakdown, sortable
  and filterable board, per-protocol detail with its edge and model inputs, a live-token tab, a
  fit scatter, a KPI strip, and a model sandbox. No network requests.
- `screenshots/` — the board, a protocol detail, and a filtered view (1440×900 each).
- `shots.mjs` — renders the dashboard in headless Chromium and takes the three screenshots.
- `verify-gate.mjs` — checks the output against every gate limit in `competition.yaml`.
