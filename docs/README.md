# PreFrame documentation

Adaptive cooperative scheduling for JavaScript. Start here:

| Doc | Audience | What you'll learn |
|---|---|---|
| [GUIDE.md](./GUIDE.md) | App developers | Install, first `run()`, patterns, pitfalls |
| [API.md](./API.md) | App developers | Full surface of `@preframe/core` |
| [ALGORITHM.md](./ALGORITHM.md) | Systems / curious | AIMD-EWMA, budgets, progressive enhancement |
| [PRIOR_ART.md](./PRIOR_ART.md) | Researchers | React Scheduler, Tempo-js, browser primitives |
| [METHODOLOGY.md](./METHODOLOGY.md) | Benchmarks | Integrity rules, metrics, env |
| [BENCHMARKS.md](./BENCHMARKS.md) | Everyone | Snapshot tables + honest reading |

## Assets

Brand SVGs for READMEs, social cards, and the demo:

| File | Use |
|---|---|
| [assets/logo.svg](./assets/logo.svg) | Mark (128²) |
| [assets/banner.svg](./assets/banner.svg) | README hero |
| [assets/diagram.svg](./assets/diagram.svg) | AIMD loop diagram |
| [assets/social.svg](./assets/social.svg) | OG / Twitter card (1200×630) |

## One-sentence pitch

**Developers describe the work; PreFrame decides how large each cooperative slice should be** — using EWMA cost prediction and AIMD congestion control — so the page stays responsive without fixed `i % N` yields.
