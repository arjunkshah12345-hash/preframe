# Getting started with PreFrame

This guide gets you from zero to a cooperative loop that keeps the UI responsive.

## Prerequisites

- Node 20+
- [pnpm](https://pnpm.io) 9+ (repo uses `pnpm@10`)
- A modern browser for the demo (Chrome/Edge preferred for `scheduler.yield` / `isInputPending`)

## 1. Clone and run the demo

```bash
git clone https://github.com/arjunkshah12345-hash/preframe.git
cd preframe
pnpm install
pnpm dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Hit **Run live comparison** or press `⌘/Ctrl+Enter`:

1. PreFrame processes a calibrated ~1.6s of work in ~8ms slices — drag and type; the page stays usable.
2. After a short countdown, the sync path runs the **identical** work and freezes the left panel.
3. Both sides show the same checksum. The banner reports the blocking reduction.

Automated critic (Playwright): start `pnpm dev`, then in another terminal:

```bash
pnpm verify:demo
```

## 2. Use `@preframe/core` locally

Packages are not published to npm yet. From the monorepo:

```bash
pnpm --filter @preframe/core build
```

In another project:

```bash
pnpm add link:/absolute/path/to/preframe/packages/core
```

Or import from the workspace if your app lives inside this monorepo.

## 3. First API: `run`

```ts
import { run } from "@preframe/core";

const items = Array.from({ length: 100_000 }, (_, i) => i);

const { results, metrics } = await run(items, (n) => {
  // Pure, CPU-bound work — keep each call reasonably short.
  return hash(n);
});

console.log(results.length);
console.log("max slice", metrics.maxSliceMs, "ms");
console.log("yields", metrics.yields);
```

**Rules of thumb**

- Prefer many small iterations over one giant iteration. PreFrame yields *between* iterations, not mid-statement.
- Async work functions are fine — PreFrame only `await`s thenables (no microtask tax on sync returns).
- Pass `signal: AbortSignal` to cancel mid-run.

## 4. Collection helpers

```ts
import { map, forEach } from "@preframe/core";

const doubled = await map(nums, (x) => x * 2);

await forEach(rows, (row) => {
  indexRow(row);
}, {
  strategy: "responsiveness", // tighter ~4ms slices
  targetFPS: 60,
  onProgress: ({ index, total, ewmaCostMs, cwnd }) => {
    setProgress(index / total);
  },
});
```

## 5. Manual control with `cooperative` or `PreframeScheduler`

When you already have a custom loop:

```ts
import { cooperative } from "@preframe/core";

const process = cooperative(async (items, ctx) => {
  for (const item of items) {
    doWork(item);
    ctx.noteIterations(1);
    if (ctx.shouldYield()) await ctx.yield();
  }
});

await process(queue);
```

Or drive the scheduler yourself:

```ts
import { PreframeScheduler } from "@preframe/core";

const scheduler = new PreframeScheduler({ maxSliceMs: 6 });

for (let i = 0; i < n; i++) {
  unit(i);
  scheduler.noteIterations(1);
  if (scheduler.shouldYield()) await scheduler.yield();
}

const metrics = scheduler.finish();
```

## 6. Choosing a strategy

| Strategy | When |
|---|---|
| `adaptive` (default) | Balanced AIMD-EWMA |
| `responsiveness` | Typing / dragging during work — tighter slice cap |
| `throughput` | Background-ish jobs where slightly longer slices are OK |

Priorities (`user-blocking` | `user-visible` | `background`) further scale the budget. See [ALGORITHM.md](./ALGORITHM.md).

## 7. Vite transform (optional, experimental)

```ts
// vite.config.ts
import preframe from "@preframe/vite";

export default {
  plugins: [preframe({ include: ["src/compute/**"] })],
};
```

```ts
/** @preframe */
export function crunch(data: number[]) {
  for (let i = 0; i < data.length; i++) {
    data[i] = transform(data[i]!);
  }
}
```

Only files that match `include` **and** carry `@preframe` are rewritten. Prefer explicit `run` / `cooperative` for production until the transform is production-grade.

## Common pitfalls

| Pitfall | Fix |
|---|---|
| One iteration takes 200ms | Split the work; PreFrame cannot interrupt mid-call |
| Expecting Worker-class speed | Use a Worker for isolated heavy compute |
| Comparing wall-clock only | Sync wins wall when idle; look at **maxBlockMs** |
| Awaiting every item yourself | Let `run()` handle thenables — don't wrap sync work in `Promise.resolve` |

## Next

- [API.md](./API.md) — complete reference  
- [ALGORITHM.md](./ALGORITHM.md) — why batch sizes move  
- [METHODOLOGY.md](./METHODOLOGY.md) — how we measure honestly  
