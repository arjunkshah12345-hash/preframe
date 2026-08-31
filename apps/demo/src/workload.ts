/**
 * Identical CPU work for both demo panels.
 * Never reduce work on the PreFrame path.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dense hash mix — intentionally heavy so freezes are visible on fast machines. */
export function expensiveOp(n: number, intensity: number): number {
  let x = (n + 1) * 2654435761;
  const iters = Math.max(1, Math.floor(intensity));
  for (let i = 0; i < iters; i++) {
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    x = (x ^ (x >>> 16)) >>> 0;
    // Keep transcendental work so V8 cannot fully elide the loop
    x = (x + Math.floor(Math.sin((x % 360) + i) * 1000)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  }
  return x;
}

export function checksum(values: ArrayLike<number>): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < values.length; i++) {
    let v = values[i]! >>> 0;
    h ^= v & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 16777619);
  }
  h ^= values.length;
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type DemoWorkload = "uniform" | "variable" | "bursty";

export function buildDemoItems(count: number, seed: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => Math.floor(rng() * 1_000_000));
}

export function intensity(kind: DemoWorkload, index: number, base: number): number {
  switch (kind) {
    case "uniform":
      return base;
    case "variable":
      return Math.max(4, Math.floor(base * (0.25 + ((index * 17) % 100) / 100)));
    case "bursty":
      return index % 64 === 0 ? base * 8 : Math.max(4, Math.floor(base * 0.35));
  }
}

/**
 * Probe the machine and size a workload so sync blocks ~targetMs.
 * Same calibrated (count, baseIntensity) is used for both paths.
 */
export function calibrateWorkload(
  targetMs = 1400,
  kind: DemoWorkload = "variable",
): { count: number; baseIntensity: number; probeMs: number } {
  const probeN = 5000;
  const probeIntensity = 60;

  // Warm the JIT so calibration matches the real run
  for (let i = 0; i < probeN; i++) {
    expensiveOp(i * 31, intensity(kind, i, probeIntensity));
  }

  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < probeN; i++) {
    acc ^= expensiveOp(i * 97, intensity(kind, i, probeIntensity));
  }
  const probeMs = Math.max(0.5, performance.now() - t0);
  void acc;

  const msPerOp = probeMs / probeN;
  const avgFactor = kind === "uniform" ? 1 : kind === "variable" ? 0.75 : 0.55;
  const effectiveMsPerOp = msPerOp * avgFactor;
  // 1.25× headroom — JIT/OS noise still undershoots otherwise
  let count = Math.floor((targetMs / effectiveMsPerOp) * 1.25);
  count = Math.min(900_000, Math.max(120_000, count));
  const baseIntensity = probeIntensity;
  return { count, baseIntensity, probeMs };
}
