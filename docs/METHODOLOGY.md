# Benchmark methodology

PreFrame benchmarks exist to compare **scheduling strategies**, not to claim absolute performance numbers that transfer across machines.

## Integrity rules

1. **Identical work.** Every strategy runs the same pure function over the same seeded input array.  
2. **Identical outputs.** Results are hashed with an FNV-1a–style checksum. A run is **invalid** if checksums diverge.  
3. **Multiple iterations.** Default: 1 warmup + 3 measured iterations per strategy × workload. Override with `PREFRAME_BENCH_ITERS` / `PREFRAME_BENCH_WARMUP`.  
4. **Report median and p95.** Wall-clock totals and blocking durations use median/p95 across iterations.  
5. **Show losses.** Sync will usually win on total completion time when the machine is idle. That is expected and printed.  

If a change “wins” by doing less work on the PreFrame path, it is a bug — not an optimization.

## Strategies compared

| Strategy | Behavior |
|---|---|
| `sync` | One continuous loop — baseline max blocking |
| `fixed-chunk` | Yield every 100 items |
| `fixed-time` | Yield every ~5ms of compute |
| `settimeout-0` | Fixed 100-item chunks + `setTimeout(0)` |
| `ric` | Fixed chunks + `requestIdleCallback` (fallback: MessageChannel) |
| `scheduler-yield` | Fixed 100-item chunks + `scheduler.yield()` when available |
| `preframe` | AIMD-EWMA adaptive batch sizing |

## Workloads

| Kind | Shape |
|---|---|
| `uniform` | Constant per-iteration cost |
| `variable` | Cost varies ~20× across items |
| `bursty` | Mostly cheap, occasional expensive spikes |
| `large` | 250k iterations |

## Metrics

| Metric | Meaning |
|---|---|
| `totalMs` | Wall clock including yields |
| `computeMs` | Time spent inside the work function / slices |
| `maxBlockMs` | Longest continuous compute slice |
| `p95BlockMs` | 95th percentile slice duration |
| `yields` | Number of host yields |
| `overheadMs` | `totalMs − computeMs` (scheduler + event-loop gap) |

**Primary tradeoff we care about:** keep `maxBlockMs` near the frame budget (~8ms) while minimizing yield overhead vs fixed chunks.

## Environment

The runner prints Node version, platform, arch, and CPU model.

| Suite | What it measures |
|---|---|
| `pnpm benchmark` (Node) | Slice length, wall, yields — **not** real browser input delay |
| Demo + `pnpm verify:demo` | Observational rAF FPS, frame gaps, calibrated sync freeze |

These are **not interchangeable**. Do not paste Node `maxBlockMs` as “input delay.”

## Running

```bash
pnpm benchmark
PREFRAME_BENCH_ITERS=5 PREFRAME_BENCH_WARMUP=2 pnpm benchmark
```

Snapshot tables live in [BENCHMARKS.md](./BENCHMARKS.md). Re-run on your machine before citing numbers in a blog post or paper.
