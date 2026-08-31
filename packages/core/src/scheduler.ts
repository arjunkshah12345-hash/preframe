import {
  AdaptiveConfig,
  AdaptiveState,
  DEFAULT_ADAPTIVE_CONFIG,
  createAdaptiveState,
  getBudgetMs,
  observeSlice,
  predictBatchSize,
  type Priority,
  type Strategy,
} from "./adaptive.js";
import { SchedulingEnv, createEnv } from "./env.js";

export interface SchedulerOptions {
  targetFPS?: number;
  maxSliceMs?: number;
  minSliceMs?: number;
  strategy?: Strategy;
  priority?: Priority;
  alpha?: number;
  safetyMargin?: number;
  minBatch?: number;
  maxBatch?: number;
  initialCostMs?: number;
  signal?: AbortSignal;
  env?: Partial<SchedulingEnv>;
}

export interface SchedulerMetrics {
  yields: number;
  slices: number;
  totalIterations: number;
  totalComputeMs: number;
  maxSliceMs: number;
  avgSliceMs: number;
  sliceDurations: number[];
}

export class PreframeScheduler {
  readonly config: AdaptiveConfig;
  readonly env: SchedulingEnv;
  private state: AdaptiveState;
  private sliceStart = 0;
  private iterationsInSlice = 0;
  private signal?: AbortSignal;
  metrics: SchedulerMetrics = {
    yields: 0,
    slices: 0,
    totalIterations: 0,
    totalComputeMs: 0,
    maxSliceMs: 0,
    avgSliceMs: 0,
    sliceDurations: [],
  };

  constructor(options: SchedulerOptions = {}) {
    this.config = {
      ...DEFAULT_ADAPTIVE_CONFIG,
      ...pickDefined({
        targetFPS: options.targetFPS,
        maxSliceMs: options.maxSliceMs,
        minSliceMs: options.minSliceMs,
        strategy: options.strategy,
        priority: options.priority,
        alpha: options.alpha,
        safetyMargin: options.safetyMargin,
        minBatch: options.minBatch,
        maxBatch: options.maxBatch,
        initialCostMs: options.initialCostMs,
      }),
    };
    this.env = createEnv(options.env);
    this.state = createAdaptiveState(this.config);
    this.signal = options.signal;
    this.sliceStart = this.env.now();
  }

  getBudget(): number {
    const hidden = this.env.visibilityState() !== "visible";
    return getBudgetMs(this.config, this.env.refreshRateHz(), hidden);
  }

  shouldYield(): boolean {
    this.throwIfAborted();
    if (this.env.isInputPending()) return true;

    const hidden = this.env.visibilityState() !== "visible";
    const elapsed = this.env.now() - this.sliceStart;
    const next = predictBatchSize(this.state, this.config, {
      refreshHz: this.env.refreshRateHz(),
      hidden,
      inputPending: false,
      elapsedInSliceMs: elapsed,
    });
    return next <= 0;
  }

  /** Suggested iterations to run before the next shouldYield check. */
  suggestedBatch(): number {
    this.throwIfAborted();
    const hidden = this.env.visibilityState() !== "visible";
    const elapsed = this.env.now() - this.sliceStart;
    return predictBatchSize(this.state, this.config, {
      refreshHz: this.env.refreshRateHz(),
      hidden,
      inputPending: this.env.isInputPending(),
      elapsedInSliceMs: elapsed,
    });
  }

  /** Record that `n` iterations just completed (for cost model). */
  noteIterations(n: number): void {
    this.iterationsInSlice += n;
    this.metrics.totalIterations += n;
  }

  async yield(): Promise<void> {
    this.throwIfAborted();
    this.closeSlice();
    this.metrics.yields += 1;
    await this.env.yieldToHost();
    this.throwIfAborted();
    this.sliceStart = this.env.now();
    this.iterationsInSlice = 0;
  }

  /** End a work session and finalize metrics. */
  finish(): SchedulerMetrics {
    if (this.iterationsInSlice > 0 || this.env.now() > this.sliceStart) {
      this.closeSlice();
    }
    const slices = this.metrics.slices;
    this.metrics.avgSliceMs =
      slices > 0 ? this.metrics.totalComputeMs / slices : 0;
    return { ...this.metrics, sliceDurations: [...this.metrics.sliceDurations] };
  }

  getState(): Readonly<AdaptiveState> {
    return this.state;
  }

  private closeSlice(): void {
    const now = this.env.now();
    const duration = Math.max(0, now - this.sliceStart);
    const budget = this.getBudget();
    if (this.iterationsInSlice > 0 || duration > 0) {
      this.state = observeSlice(this.state, this.config, {
        iterations: Math.max(1, this.iterationsInSlice),
        durationMs: Math.max(duration, 0.001),
        budgetMs: budget,
        inputPending: this.env.isInputPending(),
      });
      this.metrics.slices += 1;
      this.metrics.totalComputeMs += duration;
      this.metrics.maxSliceMs = Math.max(this.metrics.maxSliceMs, duration);
      this.metrics.sliceDurations.push(duration);
    }
    this.iterationsInSlice = 0;
  }

  private throwIfAborted(): void {
    if (this.signal?.aborted) {
      const err = new Error("PreFrame work aborted");
      err.name = "AbortError";
      throw err;
    }
  }
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
