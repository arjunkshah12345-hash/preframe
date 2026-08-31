import { run as preframeRun } from "@preframe/core";
import { WorkloadKind, checksum, makeWorkFn } from "./workloads.js";

export type StrategyName =
  | "sync"
  | "fixed-chunk"
  | "fixed-time"
  | "settimeout-0"
  | "ric"
  | "scheduler-yield"
  | "preframe";

export interface BenchResult {
  strategy: StrategyName;
  kind: WorkloadKind;
  totalMs: number;
  computeMs: number;
  maxBlockMs: number;
  p95BlockMs: number;
  yields: number;
  overheadMs: number;
  checksum: string;
  iterations: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

function summarizeBlocks(blocks: number[]): { max: number; p95: number } {
  const sorted = [...blocks].sort((a, b) => a - b);
  return { max: sorted[sorted.length - 1] ?? 0, p95: percentile(sorted, 95) };
}

async function yieldMessageChannel(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof MessageChannel !== "undefined") {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      port2.postMessage(null);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function yieldScheduler(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched?.yield) {
    await sched.yield();
    return;
  }
  await yieldMessageChannel();
}

export async function runStrategy(
  strategy: StrategyName,
  items: number[],
  kind: WorkloadKind,
  seed: number,
): Promise<BenchResult> {
  const work = makeWorkFn(kind, seed);
  const results = new Array<number>(items.length);
  const blocks: number[] = [];
  let yields = 0;
  const t0 = performance.now();
  let computeMs = 0;

  if (strategy === "sync") {
    const c0 = performance.now();
    for (let i = 0; i < items.length; i++) {
      results[i] = work(items[i]!, i);
    }
    computeMs = performance.now() - c0;
    blocks.push(computeMs);
  } else if (strategy === "fixed-chunk") {
    const CHUNK = 100;
    for (let i = 0; i < items.length; ) {
      const c0 = performance.now();
      const end = Math.min(items.length, i + CHUNK);
      while (i < end) {
        results[i] = work(items[i]!, i);
        i++;
      }
      const dt = performance.now() - c0;
      computeMs += dt;
      blocks.push(dt);
      if (i < items.length) {
        yields++;
        await yieldMessageChannel();
      }
    }
  } else if (strategy === "fixed-time") {
    const BUDGET = 5;
    let i = 0;
    while (i < items.length) {
      const c0 = performance.now();
      while (i < items.length && performance.now() - c0 < BUDGET) {
        results[i] = work(items[i]!, i);
        i++;
      }
      const dt = performance.now() - c0;
      computeMs += dt;
      blocks.push(dt);
      if (i < items.length) {
        yields++;
        await yieldMessageChannel();
      }
    }
  } else if (strategy === "settimeout-0") {
    const CHUNK = 100;
    for (let i = 0; i < items.length; ) {
      const c0 = performance.now();
      const end = Math.min(items.length, i + CHUNK);
      while (i < end) {
        results[i] = work(items[i]!, i);
        i++;
      }
      const dt = performance.now() - c0;
      computeMs += dt;
      blocks.push(dt);
      if (i < items.length) {
        yields++;
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
  } else if (strategy === "ric") {
    const CHUNK = 100;
    const hasRic =
      typeof (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback ===
      "function";
    for (let i = 0; i < items.length; ) {
      const c0 = performance.now();
      const end = Math.min(items.length, i + CHUNK);
      while (i < end) {
        results[i] = work(items[i]!, i);
        i++;
      }
      const dt = performance.now() - c0;
      computeMs += dt;
      blocks.push(dt);
      if (i < items.length) {
        yields++;
        if (hasRic) {
          await new Promise<void>((resolve) => {
            (
              globalThis as unknown as {
                requestIdleCallback: (cb: () => void, opts?: { timeout?: number }) => void;
              }
            ).requestIdleCallback(() => resolve(), { timeout: 32 });
          });
        } else {
          await yieldMessageChannel();
        }
      }
    }
  } else if (strategy === "scheduler-yield") {
    const CHUNK = 100;
    for (let i = 0; i < items.length; ) {
      const c0 = performance.now();
      const end = Math.min(items.length, i + CHUNK);
      while (i < end) {
        results[i] = work(items[i]!, i);
        i++;
      }
      const dt = performance.now() - c0;
      computeMs += dt;
      blocks.push(dt);
      if (i < items.length) {
        yields++;
        await yieldScheduler();
      }
    }
  } else if (strategy === "preframe") {
    const { results: out, metrics } = await preframeRun(items, work, {
      targetFPS: 60,
      maxSliceMs: 8,
      strategy: "adaptive",
    });
    for (let i = 0; i < out.length; i++) results[i] = out[i]!;
    computeMs = metrics.totalComputeMs;
    yields = metrics.yields;
    blocks.push(...metrics.sliceDurations);
  }

  const totalMs = performance.now() - t0;
  const { max, p95 } = summarizeBlocks(blocks);

  return {
    strategy,
    kind,
    totalMs,
    computeMs,
    maxBlockMs: max,
    p95BlockMs: p95,
    yields,
    overheadMs: Math.max(0, totalMs - computeMs),
    checksum: checksum(results),
    iterations: items.length,
  };
}
