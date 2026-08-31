export {
  createAdaptiveState,
  predictBatchSize,
  observeSlice,
  getBudgetMs,
  learningRecommendBatch,
  DEFAULT_ADAPTIVE_CONFIG,
  type AdaptiveConfig,
  type AdaptiveState,
  type Strategy,
  type Priority,
  type SliceObservation,
  type LearningFeatures,
} from "./adaptive.js";

export { createEnv, type SchedulingEnv } from "./env.js";

export {
  PreframeScheduler,
  type SchedulerOptions,
  type SchedulerMetrics,
} from "./scheduler.js";

export {
  run,
  map,
  forEach,
  each,
  cooperative,
  type WorkFn,
  type RunOptions,
  type CooperativeContext,
} from "./api.js";

import { run, map, forEach, each, cooperative } from "./api.js";
import { PreframeScheduler } from "./scheduler.js";

const preframe = {
  run,
  map,
  forEach,
  each,
  cooperative,
  Scheduler: PreframeScheduler,
};

export default preframe;
