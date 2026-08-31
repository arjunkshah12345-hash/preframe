/**
 * Adaptive batch-size predictor.
 *
 * Algorithm: "AIMD-EWMA" (Additive Increase / Multiplicative Decrease
 * with Exponentially Weighted Moving Average of per-iteration cost).
 *
 * 1. Maintain EWMA of observed per-iteration cost (ms).
 * 2. Track EWMA of squared cost for a cheap variance estimate.
 * 3. Compute available frame budget from target FPS, visibility, and
 *    strategy, then subtract a safety margin scaled by variance.
 * 4. Predict batch size = floor(availableBudget / predictedCost).
 * 5. After each slice, compare actual duration to budget:
 *    - overshoot → multiplicative decrease (×0.5) of the next batch cap
 *    - under budget with headroom → additive increase (+1 or +growth)
 * 6. Pending input forces an immediate yield (batch size 0 next check).
 *
 * This is cooperative, not preemptive. PreFrame inserts yield points;
 * it does not interrupt running JS mid-statement.
 */

export type Strategy = "adaptive" | "responsiveness" | "throughput";
export type Priority = "user-blocking" | "user-visible" | "background";

export interface AdaptiveConfig {
  targetFPS: number;
  maxSliceMs: number;
  minSliceMs: number;
  strategy: Strategy;
  priority: Priority;
  /** EWMA smoothing factor for iteration cost (0–1). Higher = more reactive. */
  alpha: number;
  /** Fraction of frame budget reserved as safety margin. */
  safetyMargin: number;
  /** Minimum predicted iterations per slice. */
  minBatch: number;
  /** Maximum predicted iterations per slice. */
  maxBatch: number;
  /** Initial guess for iteration cost (ms) before any samples. */
  initialCostMs: number;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  targetFPS: 60,
  maxSliceMs: 8,
  minSliceMs: 1,
  strategy: "adaptive",
  priority: "user-visible",
  alpha: 0.2,
  safetyMargin: 0.15,
  minBatch: 1,
  maxBatch: 100_000,
  initialCostMs: 0.05,
};

export interface SliceObservation {
  iterations: number;
  durationMs: number;
  budgetMs: number;
  inputPending: boolean;
}

export interface AdaptiveState {
  ewmaCostMs: number;
  ewmaCostSq: number;
  /** Congestion window: soft cap on next batch (AIMD). */
  cwnd: number;
  samples: number;
  lastBatch: number;
  lastDurationMs: number;
}

export function createAdaptiveState(config: AdaptiveConfig): AdaptiveState {
  // Conservative start — grow via AIMD once costs are measured.
  const seed = Math.floor(
    (config.maxSliceMs * 0.5) / Math.max(config.initialCostMs, 1e-6),
  );
  return {
    ewmaCostMs: config.initialCostMs,
    ewmaCostSq: config.initialCostMs * config.initialCostMs,
    cwnd: Math.min(config.maxBatch, Math.max(8, seed)),
    samples: 0,
    lastBatch: 0,
    lastDurationMs: 0,
  };
}

function frameBudgetMs(config: AdaptiveConfig, refreshHz: number, hidden: boolean): number {
  const hz = Math.max(30, refreshHz || config.targetFPS);
  const ideal = 1000 / Math.min(hz, config.targetFPS);

  let budget = Math.min(config.maxSliceMs, ideal * 0.7);

  if (config.strategy === "responsiveness") {
    budget = Math.min(budget, 4);
  } else if (config.strategy === "throughput") {
    budget = Math.min(config.maxSliceMs, ideal * 0.9);
  }

  if (config.priority === "user-blocking") {
    budget = Math.min(budget, 5);
  } else if (config.priority === "background") {
    budget = Math.min(config.maxSliceMs, hidden ? config.maxSliceMs : budget * 1.5);
  }

  if (hidden && config.priority !== "user-blocking") {
    // Background tabs: prefer larger slices / fewer yields.
    budget = Math.min(config.maxSliceMs * 2, 32);
  }

  return Math.max(config.minSliceMs, budget);
}

function varianceMs(state: AdaptiveState): number {
  const mean = state.ewmaCostMs;
  const second = state.ewmaCostSq;
  return Math.max(0, second - mean * mean);
}

/**
 * How many iterations can we safely run before yielding?
 */
export function predictBatchSize(
  state: AdaptiveState,
  config: AdaptiveConfig,
  opts: {
    refreshHz: number;
    hidden: boolean;
    inputPending: boolean;
    elapsedInSliceMs: number;
  },
): number {
  if (opts.inputPending) return 0;

  const fullBudget = frameBudgetMs(config, opts.refreshHz, opts.hidden);
  const remaining = fullBudget - opts.elapsedInSliceMs;
  if (remaining <= 0) return 0;

  const sigma = Math.sqrt(varianceMs(state));
  const margin = config.safetyMargin + Math.min(0.35, (sigma / Math.max(state.ewmaCostMs, 1e-6)) * 0.1);
  const available = remaining * (1 - margin);

  const cost = Math.max(state.ewmaCostMs, 1e-6);
  let predicted = Math.floor(available / cost);

  // Cold start: force tiny batches until we have real samples
  if (state.samples < 3) {
    predicted = Math.min(predicted, 16);
  }

  // AIMD congestion window soft-cap
  predicted = Math.min(predicted, Math.floor(state.cwnd));

  if (!Number.isFinite(predicted) || predicted < 0) predicted = config.minBatch;

  return clamp(predicted, config.minBatch, config.maxBatch);
}

export function observeSlice(
  state: AdaptiveState,
  config: AdaptiveConfig,
  obs: SliceObservation,
): AdaptiveState {
  if (obs.iterations <= 0) return state;

  const perIter = obs.durationMs / obs.iterations;
  const a = config.alpha;
  const ewmaCostMs = a * perIter + (1 - a) * state.ewmaCostMs;
  const ewmaCostSq = a * perIter * perIter + (1 - a) * state.ewmaCostSq;

  let cwnd = state.cwnd;
  const overshoot = obs.durationMs > obs.budgetMs * 1.15;
  const under = obs.durationMs < obs.budgetMs * 0.65;

  if (obs.inputPending || overshoot) {
    // Multiplicative decrease — aggressively back off
    cwnd = Math.max(config.minBatch, cwnd * 0.5);
  } else if (under && !obs.inputPending) {
    // Additive increase — cautiously grow
    const growth = Math.max(1, Math.floor(cwnd * 0.05));
    cwnd = Math.min(config.maxBatch, cwnd + growth);
  } else {
    // Mild additive probe
    cwnd = Math.min(config.maxBatch, cwnd + 1);
  }

  return {
    ewmaCostMs,
    ewmaCostSq,
    cwnd,
    samples: state.samples + 1,
    lastBatch: obs.iterations,
    lastDurationMs: obs.durationMs,
  };
}

export function getBudgetMs(
  config: AdaptiveConfig,
  refreshHz: number,
  hidden: boolean,
): number {
  return frameBudgetMs(config, refreshHz, hidden);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Optional online statistical predictor (stretch).
 * Uses EWMA + variance + recent overshoot ratio — no neural net.
 * Kept as an alternate strategy selectable via config.
 */
export interface LearningFeatures {
  ewmaCostMs: number;
  variance: number;
  overshootRatio: number;
  progress: number;
  hidden: boolean;
  inputPending: boolean;
}

export function learningRecommendBatch(
  features: LearningFeatures,
  config: AdaptiveConfig,
  budgetMs: number,
): number {
  if (features.inputPending) return 0;
  const cost = Math.max(features.ewmaCostMs, 1e-6);
  const sigma = Math.sqrt(Math.max(0, features.variance));
  // Widen safety when variance or recent overshoot is high
  const safety =
    config.safetyMargin +
    Math.min(0.4, features.overshootRatio * 0.3) +
    Math.min(0.25, (sigma / cost) * 0.15);
  const available = budgetMs * (1 - safety) * (features.hidden ? 1.5 : 1);
  const batch = Math.floor(available / cost);
  return clamp(batch, config.minBatch, config.maxBatch);
}
