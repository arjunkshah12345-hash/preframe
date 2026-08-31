import { describe, expect, it } from "vitest";
import {
  createAdaptiveState,
  DEFAULT_ADAPTIVE_CONFIG,
  observeSlice,
  predictBatchSize,
  cooperative,
  forEach,
  map,
  run,
  PreframeScheduler,
} from "../src/index.js";

function syncEnv(nowRef: { t: number }) {
  return {
    now: () => nowRef.t,
    isInputPending: () => false,
    yieldToHost: async () => {
      nowRef.t += 0.1;
    },
    scheduleIdle: (cb: () => void) => cb(),
    visibilityState: () => "visible" as const,
    refreshRateHz: () => 60,
    hasSchedulerYield: false,
    hasIsInputPending: false,
    hasPostTask: false,
    hasRequestIdleCallback: false,
  };
}

describe("adaptive predictor", () => {
  it("predicts larger batches for cheap iterations", () => {
    const config = { ...DEFAULT_ADAPTIVE_CONFIG, initialCostMs: 0.01 };
    let state = createAdaptiveState(config);
    // Several under-budget slices so AIMD grows the window
    for (let i = 0; i < 8; i++) {
      state = observeSlice(state, config, {
        iterations: 200,
        durationMs: 1,
        budgetMs: 8,
        inputPending: false,
      });
    }
    const batch = predictBatchSize(state, config, {
      refreshHz: 60,
      hidden: false,
      inputPending: false,
      elapsedInSliceMs: 0,
    });
    expect(batch).toBeGreaterThan(50);
  });

  it("predicts small batches for expensive iterations", () => {
    const config = { ...DEFAULT_ADAPTIVE_CONFIG, initialCostMs: 2 };
    let state = createAdaptiveState(config);
    state = observeSlice(state, config, {
      iterations: 4,
      durationMs: 8,
      budgetMs: 8,
      inputPending: false,
    });
    const batch = predictBatchSize(state, config, {
      refreshHz: 60,
      hidden: false,
      inputPending: false,
      elapsedInSliceMs: 0,
    });
    expect(batch).toBeLessThanOrEqual(10);
  });

  it("returns 0 when input is pending", () => {
    const config = DEFAULT_ADAPTIVE_CONFIG;
    const state = createAdaptiveState(config);
    const batch = predictBatchSize(state, config, {
      refreshHz: 60,
      hidden: false,
      inputPending: true,
      elapsedInSliceMs: 0,
    });
    expect(batch).toBe(0);
  });

  it("multiplicatively decreases cwnd on overshoot", () => {
    const config = DEFAULT_ADAPTIVE_CONFIG;
    let state = createAdaptiveState(config);
    state = { ...state, cwnd: 1000 };
    state = observeSlice(state, config, {
      iterations: 100,
      durationMs: 20,
      budgetMs: 8,
      inputPending: false,
    });
    expect(state.cwnd).toBeLessThanOrEqual(500);
  });

  it("additively increases cwnd when under budget", () => {
    const config = DEFAULT_ADAPTIVE_CONFIG;
    let state = createAdaptiveState(config);
    state = { ...state, cwnd: 40 };
    const before = state.cwnd;
    state = observeSlice(state, config, {
      iterations: 10,
      durationMs: 1,
      budgetMs: 8,
      inputPending: false,
    });
    expect(state.cwnd).toBeGreaterThan(before);
  });
});

describe("run / map / forEach", () => {
  it("processes empty collections", async () => {
    const { results, metrics } = await run([], () => 1);
    expect(results).toEqual([]);
    expect(metrics.totalIterations).toBe(0);
  });

  it("handles tiny workloads", async () => {
    const out = await map([1, 2, 3], (x) => x * 2);
    expect(out).toEqual([2, 4, 6]);
  });

  it("handles large workloads with identical output to sync", async () => {
    const items = Array.from({ length: 5_000 }, (_, i) => i);
    const sync = items.map((x) => x * x + 7);
    const asyncOut = await map(items, (x) => x * x + 7, {
      maxSliceMs: 2,
      env: syncEnv({ t: 0 }),
    });
    expect(asyncOut).toEqual(sync);
  });

  it("adapts across varying operation costs", async () => {
    const nowRef = { t: 0 };
    const items = Array.from({ length: 200 }, (_, i) => i);
    const metrics = await forEach(
      items,
      (x) => {
        // Simulate variable cost by advancing fake clock
        nowRef.t += x % 17 === 0 ? 1.5 : 0.05;
      },
      { env: syncEnv(nowRef), maxSliceMs: 3, initialCostMs: 0.1 },
    );
    expect(metrics.totalIterations).toBe(200);
    expect(metrics.yields).toBeGreaterThan(0);
  });

  it("propagates errors", async () => {
    await expect(
      run([1, 2, 3], (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });

  it("supports AbortSignal cancellation", async () => {
    const controller = new AbortController();
    const items = Array.from({ length: 10_000 }, (_, i) => i);
    let count = 0;
    const p = forEach(
      items,
      () => {
        count += 1;
        if (count === 50) controller.abort();
      },
      { signal: controller.signal, maxSliceMs: 1 },
    );
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("supports async work functions", async () => {
    const out = await map([1, 2, 3], async (x) => {
      await Promise.resolve();
      return x + 1;
    });
    expect(out).toEqual([2, 3, 4]);
  });
});

describe("cooperative", () => {
  it("injects context and returns metrics", async () => {
    const process = cooperative(async (items: number[], ctx) => {
      let sum = 0;
      for (const item of items) {
        sum += item;
        ctx.noteIterations(1);
        if (ctx.shouldYield()) await ctx.yield();
      }
      return sum;
    });
    const { result, metrics } = await process([1, 2, 3, 4, 5]);
    expect(result).toBe(15);
    expect(metrics.totalIterations).toBe(5);
  });
});

describe("fallback scheduler", () => {
  it("works without modern scheduling APIs", async () => {
    const nowRef = { t: 0 };
    const scheduler = new PreframeScheduler({
      env: syncEnv(nowRef),
      maxSliceMs: 2,
    });
    expect(scheduler.getBudget()).toBeGreaterThan(0);
    scheduler.noteIterations(10);
    nowRef.t += 5;
    expect(scheduler.shouldYield()).toBe(true);
    await scheduler.yield();
    const m = scheduler.finish();
    expect(m.yields).toBe(1);
  });
});
