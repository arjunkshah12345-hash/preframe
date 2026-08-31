/**
 * PreFrame environment probes — progressive enhancement over browser APIs.
 */

export interface SchedulingEnv {
  now: () => number;
  isInputPending: () => boolean;
  yieldToHost: () => Promise<void>;
  scheduleIdle: (cb: () => void, timeout?: number) => void;
  visibilityState: () => DocumentVisibilityState | "visible";
  refreshRateHz: () => number;
  hasSchedulerYield: boolean;
  hasIsInputPending: boolean;
  hasPostTask: boolean;
  hasRequestIdleCallback: boolean;
}

type DocumentVisibilityState = "visible" | "hidden" | "prerender";

interface SchedulerWithYield {
  yield?: () => Promise<void>;
  postTask?: (
    callback: () => void,
    options?: { priority?: string; signal?: AbortSignal; delay?: number },
  ) => Promise<unknown>;
}

interface NavigatorWithScheduling {
  scheduling?: {
    isInputPending?: (options?: { includeContinuous?: boolean }) => boolean;
  };
}

function createMessageChannelYield(): () => Promise<void> {
  if (typeof MessageChannel === "undefined") {
    return () =>
      new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
  }
  return () =>
    new Promise((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      port2.postMessage(null);
    });
}

function detectRefreshRate(): number {
  // Prefer Screen API when available; otherwise assume 60 Hz.
  try {
    const screenObj = typeof screen !== "undefined" ? screen : undefined;
    const rate = (screenObj as { refreshRate?: number } | undefined)?.refreshRate;
    if (typeof rate === "number" && rate > 0 && Number.isFinite(rate)) {
      return rate;
    }
  } catch {
    // ignore
  }
  return 60;
}

export function createEnv(overrides: Partial<SchedulingEnv> = {}): SchedulingEnv {
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & NavigatorWithScheduling)
      : undefined;
  const sched =
    typeof globalThis !== "undefined"
      ? ((globalThis as { scheduler?: SchedulerWithYield }).scheduler ?? undefined)
      : undefined;

  const hasSchedulerYield = typeof sched?.yield === "function";
  const hasIsInputPending = typeof nav?.scheduling?.isInputPending === "function";
  const hasPostTask = typeof sched?.postTask === "function";
  const hasRequestIdleCallback =
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback ===
      "function";

  const messageChannelYield = createMessageChannelYield();

  const yieldToHost = async (): Promise<void> => {
    if (hasSchedulerYield && sched?.yield) {
      await sched.yield();
      return;
    }
    await messageChannelYield();
  };

  const isInputPending = (): boolean => {
    if (!hasIsInputPending || !nav?.scheduling?.isInputPending) return false;
    try {
      return nav.scheduling.isInputPending({ includeContinuous: true });
    } catch {
      try {
        return nav.scheduling.isInputPending();
      } catch {
        return false;
      }
    }
  };

  const scheduleIdle = (cb: () => void, timeout = 50): void => {
    if (hasRequestIdleCallback) {
      (
        globalThis as unknown as {
          requestIdleCallback: (
            cb: () => void,
            opts?: { timeout?: number },
          ) => number;
        }
      ).requestIdleCallback(cb, { timeout });
      return;
    }
    setTimeout(cb, 0);
  };

  const visibilityState = (): DocumentVisibilityState | "visible" => {
    if (typeof document !== "undefined" && document.visibilityState) {
      return document.visibilityState as DocumentVisibilityState;
    }
    return "visible";
  };

  const base: SchedulingEnv = {
    now: () =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now(),
    isInputPending,
    yieldToHost,
    scheduleIdle,
    visibilityState,
    refreshRateHz: detectRefreshRate,
    hasSchedulerYield,
    hasIsInputPending,
    hasPostTask,
    hasRequestIdleCallback,
  };

  return { ...base, ...overrides };
}
