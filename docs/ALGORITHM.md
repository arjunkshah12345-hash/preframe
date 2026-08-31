# Adaptive algorithm (AIMD-EWMA)

PreFrame's default strategy is **AIMD-EWMA**: Additive Increase / Multiplicative Decrease combined with an Exponentially Weighted Moving Average of per-iteration cost.

## State

- `ewmaCostMs` — smoothed cost per iteration
- `ewmaCostSq` — smoothed squared cost (for variance)
- `cwnd` — congestion window (soft cap on batch size)

## Per slice

```text
budget = min(maxSliceMs, 0.7 * (1000 / targetFPS))
        × strategy/priority/visibility adjustments

available = (budget - elapsed) * (1 - safetyMargin(variance))

predictedBatch = floor(available / ewmaCostMs)
predictedBatch = min(predictedBatch, floor(cwnd))
```

After the slice completes:

- **Overshoot** (`duration > 1.15 × budget`) or pending input → `cwnd *= 0.5`
- **Under budget** (`duration < 0.65 × budget`) → additive increase
- Otherwise → mild `cwnd += 1`

## Why this over fixed time / fixed chunks

| Approach | Failure mode |
|---|---|
| Fixed N items | Bursty items blow past the frame; tiny items under-utilize |
| Fixed T ms only | Still needs a check interval; no learning across slices |
| AIMD-EWMA | Tracks cost + backs off hard on pressure, probes up when safe |

## Learning variant

`learningRecommendBatch` widens the safety margin from recent overshoot ratio and variance. It is a statistical online predictor, not an MLP. Kept as an experiment hook; the default path is AIMD-EWMA which won on simplicity vs benefit in early benches.
