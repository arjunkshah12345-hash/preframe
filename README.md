# PreFrame

**Let JavaScript work hard without freezing the page.**

```ts
import { cooperative, run } from "@preframe/core";

const process = cooperative(async (items, ctx) => {
  for (const item of items) {
    expensiveOperation(item);
    ctx.noteIterations(1);
    if (ctx.shouldYield()) await ctx.yield();
  }
});

await process(data);

// Or even simpler — PreFrame sizes the batches:
await run(items, (item) => expensiveOperation(item));
```

PreFrame dynamically determines how much JavaScript can run before returning control to the browser.

No arbitrary chunk sizes.  
No guessing when to yield.  
No frozen UI.

> **Experimental research software.** Cooperative scheduling — not preemption, not multithreading.

---

## Why

Today you either:

1. Run expensive synchronous work and **block the main thread**, or
2. Manually insert `if (i % 100 === 0) await yield()` and hope 100 was right.

Fixed chunk sizes fail on variable and bursty workloads. Fixed time budgets still need a policy for *how many* iterations to attempt before the next `performance.now()` check.

PreFrame treats slice sizing like congestion control: estimate iteration cost, fill the frame budget, back off hard when you overshoot, probe upward when you have headroom.

## Demo

```bash
pnpm install
pnpm dev
```

Open the split-screen demo:

- **Left:** same CPU workload, fully synchronous → orb freezes, input stalls, FPS collapses  
- **Right:** identical work through PreFrame → animation and controls stay responsive  
- Both sides print the same **result checksum** so you can verify the work was not faked

## How it works

```text
predictedCost = EWMA(iteration durations)
budget        = frame budget − safety margin(variance)
batchSize     = min(budget / predictedCost, congestionWindow)

run batch → measure → update EWMA
if overshoot: congestionWindow *= 0.5     (multiplicative decrease)
if under:     congestionWindow += growth  (additive increase)
if input pending: yield immediately
```

Progressive enhancement over:

- `scheduler.yield()` / `scheduler.postTask()` when available  
- `navigator.scheduling.isInputPending()`  
- `MessageChannel` / `requestAnimationFrame` fallbacks  
- visibility / refresh-rate signals when present  

See [docs/ALGORITHM.md](./docs/ALGORITHM.md) and [docs/PRIOR_ART.md](./docs/PRIOR_ART.md).

## Installation

```bash
pnpm add @preframe/core
```

Monorepo scripts:

| Command | What |
|---|---|
| `pnpm dev` | Interactive demo |
| `pnpm test` | Vitest suite |
| `pnpm benchmark` | Strategy comparison (checksum-verified) |
| `pnpm build` | Build packages + demo |

## API

```ts
import {
  run,
  map,
  forEach,
  cooperative,
  PreframeScheduler,
} from "@preframe/core";

// Collection helpers — adaptive batches built in
await forEach(items, (item) => work(item), {
  targetFPS: 60,
  maxSliceMs: 8,
  strategy: "adaptive", // | "responsiveness" | "throughput"
  priority: "user-visible",
  signal: controller.signal,
});

const doubled = await map(items, (x) => x * 2);

// Manual control surface
const scheduler = new PreframeScheduler({ maxSliceMs: 6 });
while (moreWork()) {
  doUnitOfWork();
  scheduler.noteIterations(1);
  if (scheduler.shouldYield()) await scheduler.yield();
}
```

### Opt-in Vite transform (experimental)

```ts
import preframe from "@preframe/vite";

export default {
  plugins: [
    preframe({
      include: ["src/compute/**"],
    }),
  ],
};
```

Only files matching `include` **and** marked with `/** @preframe */` (or `// @preframe`) are transformed. Blind whole-app transforms are intentionally unsupported.

## Adaptive scheduling

Primary objective: **responsiveness while maintaining maximum throughput.**

| Strategy | Behavior |
|---|---|
| `adaptive` | AIMD-EWMA (default) |
| `responsiveness` | Tighter slice cap (~4ms) |
| `throughput` | Larger fraction of the frame budget |

Documented in detail: [docs/ALGORITHM.md](./docs/ALGORITHM.md).

## Benchmarks

```bash
pnpm benchmark
```

Compares sync, fixed-chunk, fixed-time, `setTimeout(0)`, `requestIdleCallback`, `scheduler.yield()` + fixed chunks, and PreFrame — across uniform / variable / bursty / large workloads.

**Integrity:** identical seeded inputs, identical pure work function, FNV-style checksum must match. Sync usually wins wall-clock; PreFrame should win the **throughput vs max-blocking** tradeoff, especially vs naïve fixed chunks.

Snapshot from this machine: [docs/BENCHMARKS.md](./docs/BENCHMARKS.md)  
Methodology: [docs/METHODOLOGY.md](./docs/METHODOLOGY.md).

## Browser support

Works everywhere modern JS runs. Newer APIs are optional accelerators:

| API | Role |
|---|---|
| `scheduler.yield` | Preferred host yield |
| `isInputPending` | Immediate yield on input |
| `requestIdleCallback` | Idle scheduling when requested |
| `MessageChannel` | Default yield fallback |
| `performance.now` | Slice timing |

## Architecture

```text
preframe/
  packages/
    core/        # runtime + AIMD-EWMA predictor (~tiny bundle)
    vite/        # opt-in loop transform
    benchmark/   # honest strategy suite
  apps/
    demo/        # split-screen proof
  docs/
```

## Limitations

- Cooperative only — a single expensive iteration still blocks until it returns  
- Cannot beat Web Workers for heavy isolated compute that has no UI affinity  
- Vite transform is best-effort regex/AST-light; prefer `run` / `cooperative` for production  
- Node benchmarks measure slice length, not real browser input delay  
- Experimental — APIs may change

## Roadmap

- [ ] Stronger LoAF / long-task integration where available  
- [ ] Worker-aware hybrid scheduling  
- [ ] Production-grade SWC/Babel plugin replacing the light Vite transform  
- [ ] Publish `@preframe/core` to npm when stable  

## License

MIT — see [LICENSE](./LICENSE).

---

*Inspired by the Pretext idea: replace repeated expensive/general behavior with a lightweight predictive calculation. PreFrame applies that instinct to main-thread work sizing.*
