# Benchmark results (snapshot)

Recorded on: **Apple M4**, 10 CPUs, darwin arm64, **Node v25.3.0**  
Config: `PREFRAME_BENCH_ITERS=2 PREFRAME_BENCH_WARMUP=1`, seed `424242`  
Integrity: cross-strategy checksum probe **PASS**

> These numbers are a **snapshot**, not a product claim. Re-run with `pnpm benchmark` on your hardware. See [METHODOLOGY.md](./METHODOLOGY.md).

## Uniform (n=80,000)

| strategy | total med | maxBlock | yields | overhead |
|---|---:|---:|---:|---:|
| sync | 42.8 | 42.8 | 0 | 0.0 |
| fixed-chunk | 62.9 | 0.2 | 799 | 36.8 |
| fixed-time | 34.0 | 5.0 | 6 | 3.5 |
| settimeout-0 | 964.0 | 4.3 | 799 | 926.9 |
| ric | 99.3 | 0.4 | 799 | 74.6 |
| scheduler-yield | 103.3 | 0.2 | 799 | 80.9 |
| **preframe** | **38.4** | **8.0** | **4** | **5.6** |

## Variable (n=60,000)

| strategy | total med | maxBlock | yields | overhead |
|---|---:|---:|---:|---:|
| sync | 53.6 | 53.6 | 0 | 0.0 |
| fixed-chunk | 135.2 | 0.2 | 599 | 90.6 |
| fixed-time | 66.0 | 5.0 | 9 | 18.3 |
| **preframe** | **67.6** | **8.0** | **7** | **9.8** |

## Bursty (n=50,000)

| strategy | total med | maxBlock | yields | overhead |
|---|---:|---:|---:|---:|
| sync | 10.8 | 10.8 | 0 | 0.0 |
| fixed-chunk | 385.2 | 0.1 | 499 | 375.1 |
| **preframe** | **20.0** | **8.0** | **1** | **5.4** |

## Large (n=250,000)

| strategy | total med | maxBlock | yields | overhead |
|---|---:|---:|---:|---:|
| sync | 52.7 | 52.7 | 0 | 0.0 |
| fixed-chunk | 7046.9 | 0.4 | 2499 | 6988.6 |
| fixed-time | 120.0 | 5.0 | 12 | 61.0 |
| **preframe** | **224.7** | **8.6** | **13** | **120.9** |

## Browser demo critic (observational)

On the same machine, the split-screen demo calibrates ~1.6s of sync work and typically reports:

| Metric | Sync | PreFrame |
|---|---:|---:|
| Max block | ~1.6–2.7 s | ~8 ms |
| Blocking reduction | — | ~200–340× |
| Mid-run FPS (PreFrame) | — | ~45–57 |

Wall ratio varies with load (~1.1–1.4× sync). The demo’s right-panel motion during sync freeze uses a **CSS compositor** handoff so something keeps moving while the main thread is blocked — labeled honestly in the UI. That is not PreFrame scheduling itself.

## Honest reading

- **Sync wins wall-clock** when the machine is otherwise idle — expected.  
- **Fixed 100-item chunks** keep tiny slice times but destroy throughput via yield overhead (especially on `large`).  
- **PreFrame** targets the useful tradeoff: max blocking near the frame budget (~8ms) with far fewer yields than fixed chunks.  
- **Fixed-time (5ms)** is a strong baseline; PreFrame’s edge is adapting batch size without a per-iteration `now()` poll on every item, and reacting to variance / input pending in the browser.  

Re-run with `pnpm benchmark`. Cite methodology, not just the pretty column.
