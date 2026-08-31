<p align="center">
  <img src="docs/assets/logo.svg" width="88" height="88" alt="PreFrame logo"/>
</p>

<h1 align="center">PreFrame</h1>

<p align="center">
  <strong>Let JavaScript work hard without freezing the page.</strong><br/>
  Adaptive cooperative scheduling — you describe the work; PreFrame decides when to yield.
</p>

<p align="center">
  <a href="https://github.com/arjunkshah12345-hash/preframe/actions"><img alt="CI" src="https://img.shields.io/badge/tests-passing-4ade80?style=flat-square"/></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-828fff?style=flat-square"/></a>
  <a href="packages/core"><img alt="Bundle" src="https://img.shields.io/badge/core-~7.5%20KB%20ESM-5e6ad2?style=flat-square"/></a>
  <a href="docs/ALGORITHM.md"><img alt="Algorithm" src="https://img.shields.io/badge/algo-AIMD--EWMA-8a8f98?style=flat-square"/></a>
</p>

<p align="center">
  <img src="docs/assets/banner.svg" width="100%" alt="PreFrame — work hard without freezing the page"/>
</p>

```ts
import { run } from "@preframe/core";

// Same computational work as a sync for-loop.
// PreFrame only inserts yields — batch size is learned, not hard-coded.
await run(items, (item) => expensiveOperation(item));
```

No fixed `i % 100`. No frozen UI. No pretence of preemption or multithreading.

> **Experimental research software (v0.1).** Cooperative scheduling only — a single expensive iteration still blocks until it returns.

---

## Why PreFrame

| Approach | Problem |
|---|---|
| Sync loop | Blocks the main thread for the whole job |
| `if (i % N === 0) await yield()` | `N` is wrong for variable / bursty work |
| Fixed time slice | Still needs a policy for *how many* items to attempt |
| `scheduler.yield()` alone | Primitive — does not choose batch size |

PreFrame treats slice sizing like **TCP congestion control**: estimate per-iteration cost (EWMA + variance), fill the frame budget, back off hard on overshoot / pending input, probe upward when there is headroom.

<p align="center">
  <img src="docs/assets/diagram.svg" width="100%" alt="AIMD-EWMA scheduling loop"/>
</p>

## Quick start

### Try the live demo

```bash
git clone https://github.com/arjunkshah12345-hash/preframe.git
cd preframe
pnpm install
pnpm dev
```

Open the split-screen demo → **Run live comparison** (`⌘/Ctrl+Enter`):

1. **PreFrame** runs — UI stays fluid; live AIMD readout  
2. Countdown — right orb switches to compositor CSS motion  
3. **Sync freeze** — left JS orb locks; right keeps moving; ×-reduction banner  

Both sides print the same result checksum. Critic harness: `pnpm verify:demo` (with `pnpm dev` running).

### Use in a project

Packages are not on npm yet (publishing is on the roadmap). From this monorepo:

```bash
pnpm install
pnpm --filter @preframe/core build
```

```ts
import { run, map, forEach, cooperative, PreframeScheduler } from "@preframe/core";

const { results, metrics } = await run(data, (item) => work(item), {
  targetFPS: 60,
  maxSliceMs: 8,
  strategy: "adaptive", // | "responsiveness" | "throughput"
});

console.log(metrics.maxSliceMs, metrics.yields);
```

Or clone and path-link:

```bash
pnpm add link:../preframe/packages/core
```

## API at a glance

```ts
import {
  run,          // process collection → { results, metrics }
  map,          // adaptive Array.map
  forEach,      // adaptive forEach
  cooperative,  // wrap a custom async worker with ctx.shouldYield / ctx.yield
  PreframeScheduler,
} from "@preframe/core";

const process = cooperative(async (items, ctx) => {
  for (const item of items) {
    expensive(item);
    ctx.noteIterations(1);
    if (ctx.shouldYield()) await ctx.yield();
  }
});

await process(data);
```

Full reference: **[docs/API.md](./docs/API.md)** · Getting started: **[docs/GUIDE.md](./docs/GUIDE.md)**

### Opt-in Vite transform (experimental)

```ts
import preframe from "@preframe/vite";

export default {
  plugins: [
    preframe({ include: ["src/compute/**"] }),
  ],
};
```

Only files matching `include` **and** marked with `/** @preframe */` (or `// @preframe`) are transformed. Blind whole-app transforms are intentionally unsupported.

## How it works

```text
predictedCost = EWMA(iteration durations)
budget        = frame budget − safety margin(variance)
batchSize     = min(budget / predictedCost, congestionWindow)

run batch → measure → update EWMA
if overshoot or input pending:  cwnd *= 0.5   // multiplicative decrease
if under budget:                cwnd += growth // additive increase
```

Progressive enhancement over:

| API | Role |
|---|---|
| `scheduler.yield` / `postTask` | Preferred host yield |
| `navigator.scheduling.isInputPending` | Immediate yield on input |
| `MessageChannel` / `rAF` | Yield fallbacks |
| Visibility / refresh rate | Budget adjustments |

Deep dive: **[docs/ALGORITHM.md](./docs/ALGORITHM.md)** · Prior art: **[docs/PRIOR_ART.md](./docs/PRIOR_ART.md)**

## Benchmarks (honest)

```bash
pnpm benchmark
```

Compares `sync`, fixed-chunk, fixed-time, `setTimeout(0)`, `requestIdleCallback`, `scheduler.yield` + fixed chunks, and PreFrame — across uniform / variable / bursty / large workloads.

**Integrity rules:** identical seeded inputs, identical pure work function, FNV-style checksum must match. Sync usually wins wall-clock when the machine is idle; PreFrame wins the **throughput vs max-blocking** tradeoff.

Snapshot (Apple M4, Node 25):

| Workload | Sync maxBlock | PreFrame maxBlock | PreFrame vs fixed-chunk |
|---|---:|---:|---|
| Uniform 80k | 42.8 ms | **8.0 ms** | far fewer yields, similar wall |
| Bursty 50k | 10.8 ms | **8.0 ms** | fixed-chunk wall ~19× worse |
| Large 250k | 52.7 ms | **8.6 ms** | fixed-chunk wall ~30× worse |

Full tables: **[docs/BENCHMARKS.md](./docs/BENCHMARKS.md)** · Methodology: **[docs/METHODOLOGY.md](./docs/METHODOLOGY.md)**

## Monorepo

```text
preframe/
  packages/
    core/        # runtime + AIMD-EWMA (~7.5 KB minified ESM)
    vite/        # opt-in @preframe loop transform
    benchmark/   # checksum-verified strategy suite
  apps/
    demo/        # split-screen live proof
  docs/
    assets/      # logo, banner, diagram, social card
```

| Command | What |
|---|---|
| `pnpm install` | Install workspace |
| `pnpm dev` | Interactive demo |
| `pnpm test` | Vitest (`@preframe/core`) |
| `pnpm benchmark` | Strategy comparison |
| `pnpm build` | Build packages + demo |
| `pnpm verify:demo` | Playwright critic (needs `pnpm dev`) |

## What PreFrame is not

- **Not** preemptive multithreading — JS is still single-threaded  
- **Not** a substitute for Web Workers on heavy isolated compute  
- **Not** a claim that the engine interrupts mid-statement  
- **Not** magic: one pathological item still blocks until it returns  

## Roadmap

- [ ] Publish `@preframe/core` / `@preframe/vite` to npm  
- [ ] Stronger LoAF / long-task integration  
- [ ] Worker-aware hybrid scheduling  
- [ ] Production SWC/Babel plugin (replace light Vite transform)  
- [ ] Hosted demo URL  

## Docs

| Doc | Topic |
|---|---|
| [GUIDE.md](./docs/GUIDE.md) | Getting started & patterns |
| [API.md](./docs/API.md) | Full API reference |
| [ALGORITHM.md](./docs/ALGORITHM.md) | AIMD-EWMA design |
| [PRIOR_ART.md](./docs/PRIOR_ART.md) | Differentiation |
| [METHODOLOGY.md](./docs/METHODOLOGY.md) | How we measure |
| [BENCHMARKS.md](./docs/BENCHMARKS.md) | Result snapshots |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Dev workflow |

## License

MIT — see [LICENSE](./LICENSE).

---

*Inspired by the Pretext instinct: replace expensive/general browser behavior with a lightweight predictive calculation. PreFrame applies that to main-thread work sizing.*
