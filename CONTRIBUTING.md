# Contributing to PreFrame

Thanks for taking an interest. PreFrame is experimental research software — cooperative scheduling, not preemption.

## Development

```bash
pnpm install
pnpm test
pnpm benchmark
pnpm --filter @preframe/demo dev
```

| Command | Purpose |
|---|---|
| `pnpm test` | Unit tests for `@preframe/core` |
| `pnpm benchmark` | Checksum-verified strategy suite |
| `pnpm build` | Build packages + demo |
| `pnpm verify:demo` | Playwright critic (requires `pnpm dev`) |

## Guidelines

1. **Benchmark integrity first.** Never reduce computational work on the “optimized” path. Always verify checksums.  
2. **Be technically precise.** PreFrame is cooperative scheduling — not preemption, not multithreading. Docs and commit messages should say so.  
3. **Keep `@preframe/core` tiny.** Prefer progressive enhancement over hard dependencies on new APIs.  
4. **Opt-in transforms only.** The Vite plugin must never transform unmarked code outside `include` globs.  
5. **Small, focused PRs** with tests.  

## Docs

If you change public API or algorithm behavior, update:

- `docs/API.md` and/or `docs/ALGORITHM.md`  
- Snapshot notes in `docs/BENCHMARKS.md` when numbers move meaningfully  

Brand assets live in `docs/assets/`. Prefer editing the SVGs rather than exporting lossy PNGs.

## Commit style

Imperative subjects, e.g. `fix: back off cwnd faster on input pending`.

## Security

Please see [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.
