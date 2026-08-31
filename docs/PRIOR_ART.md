# Prior art & differentiation

PreFrame sits in a crowded neighborhood of “don’t block the main thread” tools. This doc states precisely what it is and what it is not.

## Related work

| System | What it does | Gap vs PreFrame |
|---|---|---|
| **React Scheduler** | Fixed ~5ms time slices + priorities for React render work | Fixed budget; not a general iteration API; no per-item cost model for arbitrary collections |
| **`scheduler.yield()`** | Browser primitive to yield to the event loop | Does not decide *when* or *how much* to run between yields |
| **`navigator.scheduling.isInputPending()`** | Detect pending input | Signal only — still need a policy |
| **`requestIdleCallback`** | Run during idle periods | Wrong tool for continuous user-visible work; coarse deadline |
| **MessageChannel yielding** | Popular pattern for breaking long tasks | Usually paired with fixed chunk sizes |
| **Tempo-js** | EMA / MLP policies that pick full/reduce/degrade multipliers for *per-frame game/animation load* | Different surface: frame-load control, not batching arbitrary `for` loops over collections |
| **Long Animation Frames (LoAF)** | Observability for long tasks | Measurement, not a scheduler |
| **Web Workers** | True parallelism off the main thread | Best for isolated compute; PreFrame is for work that must touch the UI thread |

## PreFrame's contribution

**Adaptive prediction of optimal work-slice size for general cooperative loops.**

Developers describe *what* to compute (`run` / `map` / `cooperative`). PreFrame continuously estimates per-iteration cost (EWMA + variance) and applies AIMD congestion control to choose the next batch size — maximizing throughput while keeping slices under a frame budget.

This is closer in spirit to Cheng Lou's **Pretext** (replace expensive/general browser behavior with a lightweight predictive calculation) than to “sprinkle `await scheduler.yield()` every N items.”

### One-line contrast

| Layer | Role |
|---|---|
| Browser primitives | *How* to yield |
| React Scheduler | *When* React’s own work yields (fixed slices) |
| Tempo-js | *How hard* a frame’s animation/game load should push |
| **PreFrame** | *How many* general collection iterations to run before the next yield |

## What PreFrame is not

- Not preemptive multithreading  
- Not a replacement for Web Workers for heavy isolated compute  
- Not a claim that JavaScript itself is being interrupted mid-statement  
- Not a guarantee of a specific FPS on every device  

## Honest positioning

On an idle machine, **sync often wins wall-clock**. That is expected: yields have a cost. PreFrame optimizes the **responsiveness vs throughput** frontier — especially against naïve fixed chunks, which keep tiny slice times but destroy throughput via yield overhead.

See [METHODOLOGY.md](./METHODOLOGY.md) and [BENCHMARKS.md](./BENCHMARKS.md).
