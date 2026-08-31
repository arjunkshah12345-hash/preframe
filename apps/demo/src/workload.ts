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

export function expensiveOp(n: number, intensity: number): number {
  let x = (n + 1) * 2654435761;
  const iters = Math.max(1, Math.floor(intensity));
  for (let i = 0; i < iters; i++) {
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    x = (x ^ (x >>> 16)) >>> 0;
    x = (x + Math.floor(Math.sin(x % 360) * 1000)) >>> 0;
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

export function intensity(kind: DemoWorkload, index: number): number {
  switch (kind) {
    case "uniform":
      return 12;
    case "variable":
      return 2 + ((index * 17) % 45);
    case "bursty":
      return index % 89 === 0 ? 160 : 6;
  }
}

export const WORKLOAD_COUNTS: Record<DemoWorkload, number> = {
  uniform: 120_000,
  variable: 100_000,
  bursty: 90_000,
};
