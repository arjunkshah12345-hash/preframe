# Gauntlet / demo critic notes

Internal iteration log from the split-screen demo critic (`pnpm verify:demo`). Not part of the public methodology — see [METHODOLOGY.md](./METHODOLOGY.md) and [BENCHMARKS.md](./BENCHMARKS.md) for citable numbers.

## Latest critic

Typical PASS on Apple Silicon:

- Sync max block ~1.6–2.7s (machine-calibrated workload)
- PreFrame max block ~8ms
- Blocking reduction ~200–340×
- Mid-run FPS ~45–57
- Compositor handoff + checksum match asserted

## Demo UX checklist

- Calibrated sync freeze
- Staged compare (PreFrame → countdown → sync)
- Live AIMD strip, heartbeat, frame-budget gauge
- Copy results / OG card / scroll-to-proof
