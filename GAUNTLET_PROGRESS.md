# Gauntlet Progress — PreFrame

## Goal
Make PreFrame's demo unmistakably impressive: same work, sync freezes hard, PreFrame stays fluid — on a Linear/Vercel/Resend-tier dark product site.

## Non-negotiables
- Identical computational work both paths; checksum must match
- Cooperative scheduling (no false multithreading claims)
- Dark mode; private repo
- Builder/critic emulated in-process (no Task subagents)

## Quality bar
1. Sync max-block ≥ ~800ms; PreFrame ≤ ~40ms; mid-run FPS ≥ 35; wall ≤ 3.5× sync; checksums equal
2. Visual: near-black canvas, hairline surfaces, Geist, white CTA, red/green semantics
3. Shareable first viewport with live proof

## Latest critic evidence (`node apps/demo/scripts/verify-demo.mjs`)
```
sync max block: 1.52 s
preframe max block: 7.4 ms
preframe mid-run FPS: 55–59
walls: preframe 3.34 s vs sync 1.52 s (~2.2×)
checksums: match (a67971ed)
CRITIC_VERDICT: PASS
```
Screenshot: `/tmp/preframe-gauntlet.png`

## Design references used
- Linear DESIGN.md (canvas #010102, surface ladder, lavender accent sparingly)
- Resend / Vercel dark product language (Geist, white CTA, hairlines)
- Not a clone — PreFrame identity with mint/red status semantics

## Decomposition status
| Workstream | Status | Verdict |
|---|---|---|
| Workload drama | done | Pass — machine-calibrated ~1.6s freeze |
| Demo UX | done | Pass — staged compare + freeze callout |
| Visual system | done | Parity-ish with Linear/Vercel dark bar |
| Scheduler tightness | done | Cold-start cap + hard deadline in `run` |
| Integration | done | Tests green; critic PASS |

## Remaining gaps (honest)
1. True simultaneous left-frozen / right-fluid is impossible on one main thread — demo is sequential by necessity
2. PreFrame wall still ~2× sync (scheduler + yield overhead) — expected, should stay visible in metrics
3. Visual still short of Linear’s custom type / product screenshot craft
4. Headless ≠ real trackpad input lag feel

## Note
Task subagents banned — critic = isolated Playwright harness + screenshot inspection without builder rationale.
