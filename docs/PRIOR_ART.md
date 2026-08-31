# Prior art & differentiation

## Related work

| System | What it does | Gap vs PreFrame |
|---|---|---|
| **React Scheduler** | Fixed ~5ms time slices + priorities for render work | Fixed budget; not a general iteration API; no per-item cost model |
| **`scheduler.yield()`** | Browser primitive to yield to the event loop | Does not decide *when* or *how much* to run between yields |
| **`navigator.scheduling.isInputPending()`** | Detect pending input | Signal only — still need a policy |
| **`requestIdleCallback`** | Run during idle periods | Wrong tool for continuous user-visible work; coarse deadline |
| **MessageChannel yielding** | Popular pattern for breaking long tasks | Usually paired with fixed chunk sizes |
| **Tempo-js** | EMA / MLP policies that pick full/reduce/degrade multipliers for *per-frame game/animation load* | Different surface: frame-load control, not batching arbitrary `for` loops over collections |
| **Long Animation Frames (LoAF)** | Observability for long tasks | Measurement, not a scheduler |

## PreFrame's contribution

**Adaptive prediction of optimal work-slice size for general cooperative loops.**

Developers describe *what* to compute (`run` / `map` / `cooperative`). PreFrame continuously estimates per-iteration cost (EWMA + variance) and applies AIMD congestion control to choose the next batch size — maximizing throughput while keeping slices under a frame budget.

This is closer in spirit to Cheng Lou's Pretext (replace expensive/general browser behavior with a lightweight predictive calculation) than to "sprinkle `await scheduler.yield()` every N items."

## What PreFrame is not

- Not preemptive multithreading
- Not a replacement for Web Workers for heavy isolated compute
- Not a claim that JavaScript itself is being interrupted mid-statement
