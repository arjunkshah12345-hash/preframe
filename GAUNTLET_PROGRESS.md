# Gauntlet Progress — PreFrame

## Goal
Unmistakably impressive demo + Linear/Vercel-tier dark craft.

## Latest critic (`pnpm verify:demo`)
```
sync max block:     1.86 s
preframe max block: 8.1 ms
mid-run FPS:        55–59
walls:              2.04 s vs 1.86 s (~1.1×)   ← was ~1.7–2×
yields:             198                         ← was ~400
blocking reduction: 230×
compositor handoff: yes
delta banner:       yes
CRITIC_VERDICT:     PASS
```

## This wave
- **Removed per-item `await` microtask tax** in `run()` — only await thenables
- Throttle `performance.now()` / shouldYield checks once warmed (every 8 iters)
- Main-thread **heartbeat** LED + frame-budget gauge
- Critic asserts compositor handoff, JS restore, delta banner, wall ≤1.6×
- `⌘↵` hint in hero

## Remaining gaps
1. Compositor handoff is labeled honestly (not PreFrame itself)
2. Still short of Linear custom type / product photography
3. Could add OG share card / recorded GIF for HN

## Repo
https://github.com/arjunkshah12345-hash/preframe (PRIVATE)
