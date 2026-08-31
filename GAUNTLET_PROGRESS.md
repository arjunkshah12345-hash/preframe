# Gauntlet Progress — PreFrame

## Goal
Unmistakably impressive demo + Linear/Vercel-tier dark craft.

## Latest critic (`node apps/demo/scripts/verify-demo.mjs`)
```
sync max block:     2.91 s
preframe max block: 11.5 ms
mid-run FPS:        47–56
walls:              4.18 s vs 2.91 s (~1.4×)
blocking reduction: 253×
checksums:          match
CRITIC_VERDICT:     PASS
```

## This wave
- Live AIMD readout (batch / ewma / cwnd / slice / yields)
- 3-second freeze countdown before sync
- Post-run **× reduction** delta with animated bars
- Faster AIMD recovery + 8ms slices + paint every 6th yield
- Visual craft: noise, rise motion, stronger hero, tabular metrics
- Raised critic: ≤16ms slice, ≥40 FPS, ≤3× wall

## Remaining gaps
1. Simultaneous left-frozen/right-fluid still impossible on one main thread
2. Delta banner only appears on full comparison (not verify’s separate clicks)
3. Still short of Linear’s custom display font / marketing photography
4. After global sync freeze, blocked banners can flash on both panels briefly

## Repo
https://github.com/arjunkshah12345-hash/preframe (PRIVATE)
