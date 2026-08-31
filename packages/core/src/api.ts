import { PreframeScheduler, SchedulerMetrics, SchedulerOptions } from "./scheduler.js";

export type WorkFn<T, R> = (item: T, index: number) => R | Promise<R>;

export interface RunOptions extends SchedulerOptions {
  /** Called after each yield with progress info. */
  onProgress?: (info: {
    index: number;
    total: number;
    metrics: SchedulerMetrics;
    batch: number;
    ewmaCostMs: number;
    cwnd: number;
  }) => void;
}

/**
 * Process every item with adaptive cooperative yielding.
 * Same computational work as a sync for-loop; PreFrame only inserts yields.
 */
export async function run<T, R = void>(
  items: ArrayLike<T> | Iterable<T>,
  fn: WorkFn<T, R>,
  options: RunOptions = {},
): Promise<{ results: R[]; metrics: SchedulerMetrics }> {
  const list = toArray(items);
  const scheduler = new PreframeScheduler(options);
  const results: R[] = new Array(list.length);
  let i = 0;

  while (i < list.length) {
    let batch = scheduler.suggestedBatch();
    if (batch <= 0) {
      await scheduler.yield();
      const state = scheduler.getState();
      options.onProgress?.({
        index: i,
        total: list.length,
        metrics: scheduler.metrics,
        batch: scheduler.suggestedBatch(),
        ewmaCostMs: state.ewmaCostMs,
        cwnd: state.cwnd,
      });
      batch = Math.max(1, scheduler.suggestedBatch());
    }

    const end = Math.min(list.length, i + batch);
    const sliceStart = i;
    const hardDeadline = scheduler.env.now() + scheduler.getBudget();
    // Check deadline every iteration while cold; every 8 once stable (cuts now() tax).
    const checkEvery = scheduler.getState().samples < 4 ? 1 : 8;
    let sinceCheck = 0;

    while (i < end) {
      const out = fn(list[i]!, i);
      // Avoid `await` on sync work — that was ~1 microtask per item.
      results[i] = isThenable(out) ? await out : out;
      i += 1;
      sinceCheck += 1;
      if (sinceCheck >= checkEvery) {
        sinceCheck = 0;
        if (scheduler.shouldYield() || scheduler.env.now() >= hardDeadline) break;
      }
    }
    scheduler.noteIterations(i - sliceStart);

    if (i < list.length && scheduler.shouldYield()) {
      await scheduler.yield();
      const state = scheduler.getState();
      options.onProgress?.({
        index: i,
        total: list.length,
        metrics: scheduler.metrics,
        batch: scheduler.suggestedBatch(),
        ewmaCostMs: state.ewmaCostMs,
        cwnd: state.cwnd,
      });
    }
  }

  return { results, metrics: scheduler.finish() };
}

function isThenable<T>(v: T | Promise<T>): v is Promise<T> {
  return (
    v != null &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as Promise<T>).then === "function"
  );
}

export async function forEach<T>(
  items: ArrayLike<T> | Iterable<T>,
  fn: WorkFn<T, void>,
  options: RunOptions = {},
): Promise<SchedulerMetrics> {
  const { metrics } = await run(items, fn, options);
  return metrics;
}

export async function map<T, R>(
  items: ArrayLike<T> | Iterable<T>,
  fn: WorkFn<T, R>,
  options: RunOptions = {},
): Promise<R[]> {
  const { results } = await run(items, fn, options);
  return results;
}

export interface CooperativeContext {
  shouldYield: () => boolean;
  yield: () => Promise<void>;
  getBudget: () => number;
  noteIterations: (n: number) => void;
  suggestedBatch: () => number;
  signal?: AbortSignal;
}

type CooperativeFn<A extends unknown[], R> = (
  this: void,
  ...args: [...A, CooperativeContext]
) => R | Promise<R>;

/**
 * Wrap a function so it receives a CooperativeContext as its last argument.
 *
 * @example
 * const process = cooperative(async (data, ctx) => {
 *   for (const item of data.items) {
 *     work(item);
 *     ctx.noteIterations(1);
 *     if (ctx.shouldYield()) await ctx.yield();
 *   }
 * });
 * await process({ items });
 */
export function cooperative<A extends unknown[], R>(
  fn: CooperativeFn<A, R>,
  options: SchedulerOptions = {},
): (...args: A) => Promise<{ result: Awaited<R>; metrics: SchedulerMetrics }> {
  return async (...args: A) => {
    const scheduler = new PreframeScheduler(options);
    const ctx: CooperativeContext = {
      shouldYield: () => scheduler.shouldYield(),
      yield: () => scheduler.yield(),
      getBudget: () => scheduler.getBudget(),
      noteIterations: (n) => scheduler.noteIterations(n),
      suggestedBatch: () => scheduler.suggestedBatch(),
      signal: options.signal,
    };
    const result = await fn(...args, ctx);
    return { result: result as Awaited<R>, metrics: scheduler.finish() };
  };
}

/**
 * Auto-chunked loop helper — describe work units; PreFrame sizes batches.
 */
export async function each<T>(
  items: ArrayLike<T> | Iterable<T>,
  fn: (item: T, index: number) => void | Promise<void>,
  options: RunOptions = {},
): Promise<SchedulerMetrics> {
  return forEach(items, fn, options);
}

function toArray<T>(items: ArrayLike<T> | Iterable<T>): T[] {
  if (Array.isArray(items)) return items;
  if (typeof (items as ArrayLike<T>).length === "number") {
    return Array.from(items as ArrayLike<T>);
  }
  return Array.from(items as Iterable<T>);
}
