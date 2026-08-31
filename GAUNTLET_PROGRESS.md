# Gauntlet Progress — PreFrame

## Goal
Unmistakably impressive demo + Linear/Vercel-tier dark craft.

## Latest critic (`pnpm verify:demo`)
```
sync max block:     2.75 s
preframe max block: 8.0 ms
mid-run FPS:        50–57
walls:              4.55 s vs 2.75 s (~1.7×)
blocking reduction: 344×
checksums:          match
CRITIC_VERDICT:     PASS
```

## This wave
- **Split-screen freeze illusion:** before sync, PreFrame orb switches to CSS compositor animation — keeps moving while JS-driven left orb freezes
- Satoshi display type + clearer countdown copy
- Delta banner after either path once both checksums match
- `⌘/Ctrl+Enter` to run comparison; `pnpm verify:demo`
- Clear blocked banners on both panels after sync

## Remaining gaps
1. Compositor motion ≠ PreFrame scheduling — labeled honestly as “compositor · still moving”
2. Still short of Linear custom type / product photography
3. Wall overhead ~1.7× sync — inherent to yielding

## Repo
https://github.com/arjunkshah12345-hash/preframe (PRIVATE)
