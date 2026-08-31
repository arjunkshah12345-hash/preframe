# `@preframe/core`

Adaptive cooperative scheduling runtime for JavaScript (~7.5 KB minified ESM).

```ts
import { run } from "@preframe/core";

await run(items, (item) => expensive(item));
```

You describe the work. PreFrame decides how large each slice should be (AIMD-EWMA).

- **Docs:** [../../docs/GUIDE.md](../../docs/GUIDE.md) · [../../docs/API.md](../../docs/API.md)
- **Algorithm:** [../../docs/ALGORITHM.md](../../docs/ALGORITHM.md)
- **License:** MIT

> Cooperative only — not preemption, not multithreading.
