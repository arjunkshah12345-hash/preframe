# Adaptive algorithm (AIMD-EWMA)

PreFrame's default strategy is **AIMD-EWMA**: Additive Increase / Multiplicative Decrease combined with an Exponentially Weighted Moving Average of per-iteration cost.

The design goal is simple:

> **Maximize throughput subject to keeping each cooperative slice under a frame budget.**

Developers describe *what* to compute. PreFrame continuously estimates *how much* to run before yielding.

---

## Intuition

Fixed chunk sizes (`yield every 100 items`) fail when item cost varies. Fixed time budgets (`yield every 5ms`) still need a policy for how many iterations to attempt before the next `performance.now()` check — and they do not learn across slices.

PreFrame borrows the congestion-control loop from networking:

1. **Estimate** the cost of one iteration.  
2. **Fill** the remaining frame budget with as many iterations as that estimate allows.  
3. **Back off hard** if a slice overshoots or input is pending.  
4. **Probe upward** when slices finish comfortably under budget.

---

## State

| Symbol | Meaning |
|---|---|
| `ewmaCostMs` | Smoothed cost per iteration |
| `ewmaCostSq` | Smoothed squared cost (variance proxy) |
| `cwnd` | Congestion window — soft cap on batch size |
| `samples` | Number of observed slices (warm-up gate) |

EWMA update (conceptual):

```text
ewmaCostMs ← (1 − α) · ewmaCostMs + α · (sliceMs / iterations)
```

Variance widens the **safety margin**: bursty workloads leave more unused budget rather than overshooting.

---

## Per slice

```text
budget = min(maxSliceMs, 0.7 · (1000 / targetFPS))
       × strategy / priority / visibility adjustments

available = (budget − elapsed) · (1 − safetyMargin(variance))

predictedBatch = floor(available / ewmaCostMs)
predictedBatch = clamp(predictedBatch, minBatch, maxBatch)
predictedBatch = min(predictedBatch, floor(cwnd))
```

After the slice completes:

| Condition | Action |
|---|---|
| `duration > 1.15 × budget` **or** pending input | `cwnd *= 0.5` (multiplicative decrease) |
| `duration < 0.65 × budget` | Additive increase (probe) |
| Otherwise | Mild `cwnd += 1` |

Strategies rescale the budget:

| Strategy | Behavior |
|---|---|
| `adaptive` | Default AIMD-EWMA |
| `responsiveness` | Tighter slice cap (~4ms class) |
| `throughput` | Larger fraction of the frame budget |

Priorities (`user-blocking` / `user-visible` / `background`) and document visibility further scale the budget. Refresh-rate hints (when available) adjust the frame period.

---

## Progressive enhancement

PreFrame never *requires* bleeding-edge APIs. Newer surfaces are accelerators:

| API | Role |
|---|---|
| `scheduler.yield()` / `scheduler.postTask()` | Preferred host yield |
| `navigator.scheduling.isInputPending()` | Immediate yield on input |
| `MessageChannel` | Default yield fallback |
| `requestAnimationFrame` | Alignment / fallback path |
| `requestIdleCallback` | Only when idle scheduling is explicitly appropriate |
| `performance.now()` | Slice timing |
| Visibility / refresh rate | Budget adjustments |

---

## Runtime notes (implementation)

These details matter for honest wall-clock numbers:

1. **`run()` only `await`s thenables.** Sync work functions must not pay a microtask per item — that tax dominated wall time on large collections before PreFrame 0.1.  
2. **Warm-up vs steady state.** While `samples < 4`, deadline checks run every iteration. Once warmed, checks run every **4** iterations to cut `performance.now()` overhead while still respecting the frame budget.  
3. **Cooperative boundary.** Yields happen *between* iterations. A single pathological call still blocks until it returns.

---

## Learning variant

`learningRecommendBatch` widens the safety margin from recent overshoot ratio and variance. It is a statistical online predictor, **not** an MLP. Kept as an experiment hook; the default path is AIMD-EWMA, which won on simplicity vs benefit in early benches.

---

## Why this over fixed time / fixed chunks

| Approach | Failure mode |
|---|---|
| Fixed N items | Bursty items blow past the frame; tiny items under-utilize |
| Fixed T ms only | Still needs a check interval; no learning across slices |
| AIMD-EWMA | Tracks cost + backs off hard on pressure, probes up when safe |

For differentiation vs React Scheduler, Tempo-js, and browser primitives, see [PRIOR_ART.md](./PRIOR_ART.md).
