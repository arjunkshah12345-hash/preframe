# Contributing to PreFrame

Thanks for taking an interest. PreFrame is experimental research software.

## Development

```bash
pnpm install
pnpm test
pnpm benchmark
pnpm --filter @preframe/demo dev
```

## Guidelines

1. **Benchmark integrity first.** Never reduce computational work on the "optimized" path. Always verify checksums.
2. **Be technically precise.** PreFrame is cooperative scheduling — not preemption, not multithreading.
3. **Keep `@preframe/core` tiny.** Prefer progressive enhancement over hard dependencies on new APIs.
4. **Opt-in transforms only.** The Vite plugin must never transform unmarked code outside `include` globs.
5. Small, focused PRs with tests.

## Commit style

Imperative subjects, e.g. `fix: back off cwnd faster on input pending`.
