# API reference — `@preframe/core`

Version: **0.1.0** · Bundle: **~7.5 KB** minified ESM · License: MIT

```ts
import preframe, {
  run,
  map,
  forEach,
  each,
  cooperative,
  PreframeScheduler,
  createAdaptiveState,
  predictBatchSize,
  observeSlice,
  getBudgetMs,
  createEnv,
} from "@preframe/core";
```

Default export: `{ run, map, forEach, each, cooperative, Scheduler: PreframeScheduler }`.

---

## `run(items, fn, options?)`

Process every item with adaptive cooperative yielding. Computational work matches a sync `for` loop; PreFrame only inserts yields between items.

```ts
const { results, metrics } = await run(items, (item, index) => work(item), {
  maxSliceMs: 8,
  targetFPS: 60,
  strategy: "adaptive",
  priority: "user-visible",
  signal: controller.signal,
  onProgress: ({ index, total, metrics, batch, ewmaCostMs, cwnd }) => {
    /* ... */
  },
});
```

| Param | Type | Notes |
|---|---|---|
| `items` | `ArrayLike<T> \| Iterable<T>` | Materialized to an array once |
| `fn` | `(item, index) => R \| Promise<R>` | Sync returns are **not** wrapped in microtasks |
| `options` | `RunOptions` | Extends `SchedulerOptions` + `onProgress` |

**Returns:** `Promise<{ results: R[]; metrics: SchedulerMetrics }>`

### `RunOptions`

All `SchedulerOptions`, plus:

| Field | Type | Description |
|---|---|---|
| `onProgress` | `(info) => void` | Called after each yield with index, totals, metrics, suggested batch, EWMA cost, `cwnd` |

---

## `map` / `forEach` / `each`

```ts
const out = await map(items, (x) => x * 2, options);
const metrics = await forEach(items, (x) => sideEffect(x), options);
const metrics = await each(items, fn, options); // alias of forEach
```

- `map` → `Promise<R[]>`
- `forEach` / `each` → `Promise<SchedulerMetrics>`

---

## `cooperative(fn)`

Wrap a custom async function so it receives a `CooperativeContext`:

```ts
const process = cooperative(async (items, ctx) => {
  for (const item of items) {
    heavy(item);
    ctx.noteIterations(1);
    if (ctx.shouldYield()) await ctx.yield();
  }
});

await process(data, { maxSliceMs: 6 });
```

### `CooperativeContext`

| Method | Description |
|---|---|
| `shouldYield()` | `true` if budget exhausted, input pending, or abort signaled |
| `yield()` | Awaitable host yield (`scheduler.yield` → MessageChannel fallback) |
| `getBudget()` | Current slice budget in ms |
| `noteIterations(n)` | Record `n` iterations completed in the current slice |
| `suggestedBatch()` | AIMD-EWMA recommended next batch size |
| `signal?` | Optional `AbortSignal` |

---

## `PreframeScheduler`

Low-level control surface shared by `run` / `cooperative`.

```ts
const scheduler = new PreframeScheduler({
  targetFPS: 60,
  maxSliceMs: 8,
  minSliceMs: 1,
  strategy: "adaptive",
  priority: "user-visible",
  alpha: 0.2,
  safetyMargin: 0.15,
  minBatch: 1,
  maxBatch: 50_000,
  initialCostMs: 0.05,
  signal,
  env: { /* test doubles */ },
});

scheduler.noteIterations(1);
if (scheduler.shouldYield()) await scheduler.yield();
const metrics = scheduler.finish();
```

### `SchedulerOptions`

| Option | Default | Meaning |
|---|---|---|
| `targetFPS` | `60` | Used to derive frame budget |
| `maxSliceMs` | `8` | Hard cap on slice length |
| `minSliceMs` | `1` | Floor |
| `strategy` | `"adaptive"` | `"adaptive" \| "responsiveness" \| "throughput"` |
| `priority` | `"user-visible"` | `"user-blocking" \| "user-visible" \| "background"` |
| `alpha` | ~`0.2` | EWMA smoothing factor |
| `safetyMargin` | ~`0.15` | Base fraction of budget reserved |
| `minBatch` / `maxBatch` | `1` / large | Clamp predicted batch |
| `initialCostMs` | small | Seed before samples exist |
| `signal` | — | Abort mid-run |
| `env` | auto | Injectable timing / yield / input probes |

### `SchedulerMetrics`

| Field | Description |
|---|---|
| `yields` | Host yields performed |
| `slices` | Completed compute slices |
| `totalIterations` | Items / units processed |
| `totalComputeMs` | Time inside slices |
| `maxSliceMs` | Longest slice |
| `avgSliceMs` | Mean slice |
| `sliceDurations` | Per-slice durations (ms) |

### Notable methods

| Method | Description |
|---|---|
| `getBudget()` | Current budget (FPS, priority, visibility aware) |
| `suggestedBatch()` | Predicted batch size |
| `shouldYield()` | Budget / input / abort check |
| `yield()` | Host yield + start next slice |
| `noteIterations(n)` | Close out slice observation after `n` units |
| `getState()` | Adaptive state (`ewmaCostMs`, `cwnd`, `samples`, …) |
| `finish()` | Finalize and return metrics |

---

## Adaptive helpers (advanced)

Exported for tests and experiments:

| Export | Role |
|---|---|
| `createAdaptiveState(config)` | Fresh AIMD-EWMA state |
| `predictBatchSize(state, config, budget, elapsed)` | Next batch |
| `observeSlice(state, config, observation)` | Update after a slice |
| `getBudgetMs(config, refreshHz, hidden)` | Budget calculation |
| `learningRecommendBatch(...)` | Experimental variance/overshoot variant |
| `DEFAULT_ADAPTIVE_CONFIG` | Defaults object |
| `createEnv(partial?)` | Browser/Node scheduling environment |

See [ALGORITHM.md](./ALGORITHM.md) for semantics.

---

## Type aliases

```ts
type Strategy = "adaptive" | "responsiveness" | "throughput";
type Priority = "user-blocking" | "user-visible" | "background";
type WorkFn<T, R> = (item: T, index: number) => R | Promise<R>;
```

---

## Design notes

1. **`run` never `await`s sync returns** — that tax dominated wall time before 0.1.  
2. **Deadline checks every 4 iterations** once warmed (`samples ≥ 4`) to cut `performance.now()` overhead.  
3. **Cooperative only** — PreFrame cannot preempt a single long `fn` call.  

For usage patterns, see [GUIDE.md](./GUIDE.md).
