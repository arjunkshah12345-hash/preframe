/**
 * Shared CPU workloads — identical work across all schedulers.
 * Never reduce work for "optimized" paths.
 */

export type WorkloadKind = "uniform" | "variable" | "bursty" | "large";

export interface WorkloadSpec {
  kind: WorkloadKind;
  count: number;
  seed: number;
}

/** Deterministic PRNG (mulberry32). */
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

/** Cheap but non-trivial pure compute — same ops every call for same input. */
export function expensiveOp(n: number, intensity = 1): number {
  let x = (n + 1) * 2654435761;
  const iters = Math.max(1, Math.floor(intensity));
  for (let i = 0; i < iters; i++) {
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    x = (x ^ (x >>> 16)) >>> 0;
    // Keep some floating work so JITs can't fully elide
    x = (x + Math.floor(Math.sin(x % 360) * 1000)) >>> 0;
  }
  return x;
}

export function intensityFor(kind: WorkloadKind, index: number, rng: () => number): number {
  switch (kind) {
    case "uniform":
      return 8;
    case "variable":
      return 2 + Math.floor(rng() * 40);
    case "bursty":
      return index % 97 === 0 ? 120 : 4;
    case "large":
      return 6;
    default:
      return 8;
  }
}

export function defaultCount(kind: WorkloadKind): number {
  switch (kind) {
    case "uniform":
      return 80_000;
    case "variable":
      return 60_000;
    case "bursty":
      return 50_000;
    case "large":
      return 250_000;
  }
}

export function buildItems(spec: WorkloadSpec): number[] {
  const rng = mulberry32(spec.seed);
  const items = new Array<number>(spec.count);
  for (let i = 0; i < spec.count; i++) {
    items[i] = Math.floor(rng() * 1_000_000);
  }
  return items;
}

/** FNV-1a style checksum over results — verify identical outputs. */
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

export function runSync(
  items: number[],
  kind: WorkloadKind,
  seed: number,
): { results: number[]; checksum: string; computeMs: number } {
  const rng = mulberry32(seed);
  // Precompute intensities so adaptive/sync see the same costs
  const intensities = items.map((_, i) => intensityFor(kind, i, rng));
  const results = new Array<number>(items.length);
  const t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    results[i] = expensiveOp(items[i]!, intensities[i]!);
  }
  const computeMs = performance.now() - t0;
  return { results, checksum: checksum(results), computeMs };
}

export function makeWorkFn(kind: WorkloadKind, seed: number) {
  const rng = mulberry32(seed);
  const intensities: number[] = [];
  // Lazily filled to match index order
  return (item: number, index: number): number => {
    while (intensities.length <= index) {
      intensities.push(intensityFor(kind, intensities.length, rng));
    }
    return expensiveOp(item, intensities[index]!);
  };
}
