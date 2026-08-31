import "./styles.css";
import { run as preframeRun } from "@preframe/core";
import {
  DemoWorkload,
  WORKLOAD_COUNTS,
  buildDemoItems,
  checksum,
  expensiveOp,
  intensity,
} from "./workload";

interface PanelMetrics {
  totalMs: number;
  computeMs: number;
  maxBlockMs: number;
  avgSliceMs: number;
  yields: number;
  fps: number;
  inputLatencyMs: number;
  throughput: number;
  checksum: string;
  progress: number;
}

interface PanelEls {
  root: HTMLElement;
  orb: HTMLElement;
  fps: HTMLElement;
  input: HTMLInputElement;
  clickBtn: HTMLButtonElement;
  clickCount: HTMLElement;
  progress: HTMLElement;
  metrics: Record<string, HTMLElement>;
}

function emptyMetrics(): PanelMetrics {
  return {
    totalMs: 0,
    computeMs: 0,
    maxBlockMs: 0,
    avgSliceMs: 0,
    yields: 0,
    fps: 60,
    inputLatencyMs: 0,
    throughput: 0,
    checksum: "—",
    progress: 0,
  };
}

function el(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function formatMs(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} ms`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

class FpsTracker {
  private frames: number[] = [];
  private last = performance.now();
  private raf = 0;
  private x = 20;
  private dir = 1;
  private dragging = false;
  private dragOffset = 0;
  fps = 60;
  maxFrameGap = 0;

  constructor(
    private orb: HTMLElement,
    private badge: HTMLElement,
    private panel: HTMLElement,
  ) {
    this.bindDrag();
  }

  start(): void {
    const loop = (t: number) => {
      const dt = t - this.last;
      this.last = t;
      this.frames.push(dt);
      if (this.frames.length > 60) this.frames.shift();
      this.maxFrameGap = Math.max(this.maxFrameGap, dt);
      const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
      this.fps = avg > 0 ? 1000 / avg : 60;
      this.badge.textContent = `${this.fps.toFixed(0)} FPS`;
      this.badge.classList.toggle("low", this.fps < 40);
      this.panel.classList.toggle("frozen", this.fps < 25);

      if (!this.dragging) {
        this.x += this.dir * 2.2;
        const max = this.panel.querySelector(".stage")!.clientWidth - 48;
        if (this.x > max) this.dir = -1;
        if (this.x < 12) this.dir = 1;
      }
      this.orb.style.transform = `translateX(${this.x}px)`;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resetGaps(): void {
    this.maxFrameGap = 0;
    this.frames = [];
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private bindDrag(): void {
    const onDown = (clientX: number) => {
      this.dragging = true;
      this.dragOffset = clientX - this.x;
    };
    const onMove = (clientX: number) => {
      if (!this.dragging) return;
      const max = (this.panel.querySelector(".stage") as HTMLElement).clientWidth - 48;
      this.x = Math.min(max, Math.max(12, clientX - this.dragOffset));
    };
    const onUp = () => {
      this.dragging = false;
    };

    this.orb.addEventListener("pointerdown", (e) => {
      this.orb.setPointerCapture(e.pointerId);
      onDown(e.clientX);
    });
    this.orb.addEventListener("pointermove", (e) => onMove(e.clientX));
    this.orb.addEventListener("pointerup", onUp);
    this.orb.addEventListener("pointercancel", onUp);
  }
}

function buildPanel(kind: "without" | "with"): { wrap: HTMLElement; els: PanelEls } {
  const title =
    kind === "without"
      ? `<span class="label-bad">Without PreFrame</span><span>synchronous</span>`
      : `<span class="label-good">With PreFrame</span><span>adaptive</span>`;

  const wrap = el(`
    <section class="panel panel-${kind}">
      <div class="panel-head">${title}</div>
      <div class="stage">
        <div class="orb" title="Drag me"></div>
        <div class="fps-badge">60 FPS</div>
      </div>
      <div class="ui-row">
        <input type="text" placeholder="Type while it runs…" />
        <button type="button">Click</button>
        <span class="click-count">clicks: 0</span>
      </div>
      <div class="progress"><span></span></div>
      <div class="metrics">
        <div class="metric"><span class="k">Completion</span><span class="v" data-m="totalMs">—</span></div>
        <div class="metric"><span class="k">Max block</span><span class="v" data-m="maxBlockMs">—</span></div>
        <div class="metric"><span class="k">Avg slice</span><span class="v" data-m="avgSliceMs">—</span></div>
        <div class="metric"><span class="k">Yields</span><span class="v" data-m="yields">—</span></div>
        <div class="metric"><span class="k">Est. FPS</span><span class="v" data-m="fps">—</span></div>
        <div class="metric"><span class="k">Input lag</span><span class="v" data-m="inputLatencyMs">—</span></div>
        <div class="metric"><span class="k">Compute time</span><span class="v" data-m="computeMs">—</span></div>
        <div class="metric"><span class="k">Throughput</span><span class="v" data-m="throughput">—</span></div>
        <div class="metric" style="grid-column:1/-1"><span class="k">Result checksum</span><span class="v accent" data-m="checksum">—</span></div>
      </div>
    </section>
  `);

  const metrics: Record<string, HTMLElement> = {};
  wrap.querySelectorAll<HTMLElement>("[data-m]").forEach((node) => {
    metrics[node.dataset.m!] = node;
  });

  const els: PanelEls = {
    root: wrap,
    orb: wrap.querySelector(".orb")!,
    fps: wrap.querySelector(".fps-badge")!,
    input: wrap.querySelector("input")!,
    clickBtn: wrap.querySelector(".ui-row button")!,
    clickCount: wrap.querySelector(".click-count")!,
    progress: wrap.querySelector(".progress > span")!,
    metrics,
  };

  let clicks = 0;
  els.clickBtn.addEventListener("click", () => {
    clicks += 1;
    els.clickCount.textContent = `clicks: ${clicks}`;
  });

  return { wrap, els };
}

function renderMetrics(els: PanelEls, m: PanelMetrics): void {
  els.metrics.totalMs!.textContent = formatMs(m.totalMs);
  els.metrics.maxBlockMs!.textContent = formatMs(m.maxBlockMs);
  els.metrics.maxBlockMs!.className = `v ${m.maxBlockMs > 50 ? "danger" : "ok"}`;
  els.metrics.avgSliceMs!.textContent = formatMs(m.avgSliceMs);
  els.metrics.yields!.textContent = formatNum(m.yields);
  els.metrics.fps!.textContent = `${m.fps.toFixed(0)}`;
  els.metrics.fps!.className = `v ${m.fps < 40 ? "danger" : "ok"}`;
  els.metrics.inputLatencyMs!.textContent = formatMs(m.inputLatencyMs);
  els.metrics.computeMs!.textContent = formatMs(m.computeMs);
  els.metrics.throughput!.textContent = `${formatNum(m.throughput)} ops/s`;
  els.metrics.checksum!.textContent = m.checksum;
  els.progress.style.width = `${Math.min(100, m.progress * 100)}%`;
}

async function runSyncWorkload(
  items: number[],
  kind: DemoWorkload,
  onProgress: (p: number, blockMs: number) => void,
): Promise<{ results: number[]; computeMs: number; maxBlockMs: number; totalMs: number }> {
  const results = new Array<number>(items.length);
  const t0 = performance.now();
  // One continuous block — this is the point of the demo
  const c0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    results[i] = expensiveOp(items[i]!, intensity(kind, i));
    if (i % 5000 === 0) {
      onProgress(i / items.length, performance.now() - c0);
    }
  }
  const computeMs = performance.now() - c0;
  onProgress(1, computeMs);
  return {
    results,
    computeMs,
    maxBlockMs: computeMs,
    totalMs: performance.now() - t0,
  };
}

async function runPreframeWorkload(
  items: number[],
  kind: DemoWorkload,
  onProgress: (p: number) => void,
): Promise<{
  results: number[];
  computeMs: number;
  maxBlockMs: number;
  avgSliceMs: number;
  yields: number;
  totalMs: number;
}> {
  const t0 = performance.now();
  const { results, metrics } = await preframeRun(
    items,
    (item, index) => expensiveOp(item, intensity(kind, index)),
    {
      targetFPS: 60,
      maxSliceMs: 6,
      strategy: "adaptive",
      onProgress: ({ index, total }) => onProgress(index / total),
    },
  );
  onProgress(1);
  return {
    results,
    computeMs: metrics.totalComputeMs,
    maxBlockMs: metrics.maxSliceMs,
    avgSliceMs: metrics.avgSliceMs,
    yields: metrics.yields,
    totalMs: performance.now() - t0,
  };
}

function measureInputLatency(input: HTMLInputElement): {
  start: () => void;
  stop: () => number;
} {
  const samples: number[] = [];
  let lastKey = 0;
  const onKey = () => {
    const now = performance.now();
    if (lastKey > 0) samples.push(now - lastKey);
    lastKey = now;
  };
  return {
    start: () => {
      samples.length = 0;
      lastKey = 0;
      input.addEventListener("keydown", onKey);
    },
    stop: () => {
      input.removeEventListener("keydown", onKey);
      if (samples.length === 0) return 0;
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    },
  };
}

function main(): void {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  const header = el(`
    <header class="top">
      <div class="brand">
        <h1>PreFrame</h1>
        <span class="tag">experimental</span>
      </div>
      <p class="lede">
        <strong>Same JavaScript workload. Same output. Dramatically better responsiveness.</strong>
        PreFrame predicts how much work fits in a frame — then yields before the UI freezes.
      </p>
      <pre class="code-hero">const process = cooperative(expensiveWork);
await process(data); // adaptive yields — not fixed chunks</pre>
      <div class="controls">
        <button class="primary" id="run-both" type="button">Run comparison</button>
        <button id="run-without" type="button">Run without</button>
        <button id="run-with" type="button">Run with PreFrame</button>
        <label class="select-wrap">workload
          <select id="workload">
            <option value="variable" selected>variable</option>
            <option value="uniform">uniform</option>
            <option value="bursty">bursty</option>
          </select>
        </label>
        <span class="hint">Drag the orb · type · click while it runs</span>
      </div>
    </header>
  `);

  const split = el(`<div class="split"></div>`);
  const left = buildPanel("without");
  const right = buildPanel("with");
  split.append(left.wrap, right.wrap);

  const verify = el(`
    <div class="verify">
      <span>Integrity: both sides must produce the same checksum for the same seed & workload.</span>
      <span id="verify-status">idle</span>
    </div>
  `);

  const footer = el(`
    <p class="footer-note">
      PreFrame is <strong>cooperative</strong> scheduling — not preemption, not multithreading.
      It inserts adaptive yield points and sizes work slices with an AIMD + EWMA predictor.
      Experimental research software.
    </p>
  `);

  app.append(header, split, verify, footer);

  const fpsLeft = new FpsTracker(left.els.orb, left.els.fps, left.els.root);
  const fpsRight = new FpsTracker(right.els.orb, right.els.fps, right.els.root);
  fpsLeft.start();
  fpsRight.start();

  const runBothBtn = header.querySelector("#run-both") as HTMLButtonElement;
  const runWithoutBtn = header.querySelector("#run-without") as HTMLButtonElement;
  const runWithBtn = header.querySelector("#run-with") as HTMLButtonElement;
  const workloadSelect = header.querySelector("#workload") as HTMLSelectElement;
  const verifyStatus = verify.querySelector("#verify-status") as HTMLElement;

  let leftM = emptyMetrics();
  let rightM = emptyMetrics();
  renderMetrics(left.els, leftM);
  renderMetrics(right.els, rightM);

  const setBusy = (busy: boolean) => {
    runBothBtn.disabled = busy;
    runWithoutBtn.disabled = busy;
    runWithBtn.disabled = busy;
    workloadSelect.disabled = busy;
  };

  async function runWithout(): Promise<string> {
    const kind = workloadSelect.value as DemoWorkload;
    const items = buildDemoItems(WORKLOAD_COUNTS[kind], 42);
    leftM = emptyMetrics();
    fpsLeft.resetGaps();
    const latency = measureInputLatency(left.els.input);
    latency.start();

    // Yield to paint "running" state
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const result = await runSyncWorkload(items, kind, (p, block) => {
      leftM.progress = p;
      leftM.maxBlockMs = block;
      leftM.fps = fpsLeft.fps;
      renderMetrics(left.els, leftM);
    });

    leftM = {
      ...leftM,
      totalMs: result.totalMs,
      computeMs: result.computeMs,
      maxBlockMs: result.maxBlockMs,
      avgSliceMs: result.computeMs,
      yields: 0,
      fps: fpsLeft.fps,
      inputLatencyMs: latency.stop(),
      throughput: items.length / (result.totalMs / 1000),
      checksum: checksum(result.results),
      progress: 1,
    };
    // Prefer observed frame gap as blocking proxy when available
    leftM.maxBlockMs = Math.max(leftM.maxBlockMs, fpsLeft.maxFrameGap);
    renderMetrics(left.els, leftM);
    return leftM.checksum;
  }

  async function runWith(): Promise<string> {
    const kind = workloadSelect.value as DemoWorkload;
    const items = buildDemoItems(WORKLOAD_COUNTS[kind], 42);
    rightM = emptyMetrics();
    fpsRight.resetGaps();
    const latency = measureInputLatency(right.els.input);
    latency.start();

    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const result = await runPreframeWorkload(items, kind, (p) => {
      rightM.progress = p;
      rightM.fps = fpsRight.fps;
      rightM.maxBlockMs = fpsRight.maxFrameGap;
      renderMetrics(right.els, rightM);
    });

    rightM = {
      ...rightM,
      totalMs: result.totalMs,
      computeMs: result.computeMs,
      maxBlockMs: Math.max(result.maxBlockMs, fpsRight.maxFrameGap),
      avgSliceMs: result.avgSliceMs,
      yields: result.yields,
      fps: fpsRight.fps,
      inputLatencyMs: latency.stop(),
      throughput: items.length / (result.totalMs / 1000),
      checksum: checksum(result.results),
      progress: 1,
    };
    renderMetrics(right.els, rightM);
    return rightM.checksum;
  }

  runWithoutBtn.addEventListener("click", async () => {
    setBusy(true);
    verifyStatus.textContent = "running without…";
    verifyStatus.className = "";
    try {
      await runWithout();
      verifyStatus.textContent = `without checksum ${leftM.checksum}`;
    } finally {
      setBusy(false);
    }
  });

  runWithBtn.addEventListener("click", async () => {
    setBusy(true);
    verifyStatus.textContent = "running with PreFrame…";
    verifyStatus.className = "";
    try {
      await runWith();
      verifyStatus.textContent = `with checksum ${rightM.checksum}`;
    } finally {
      setBusy(false);
    }
  });

  runBothBtn.addEventListener("click", async () => {
    setBusy(true);
    verifyStatus.textContent = "running…";
    verifyStatus.className = "";
    try {
      // Sequential so the freeze is obvious on the left first
      const a = await runWithout();
      const b = await runWith();
      if (a === b) {
        verifyStatus.textContent = `PASS — identical checksum ${a}`;
        verifyStatus.className = "ok";
      } else {
        verifyStatus.textContent = `FAIL — checksums differ (${a} vs ${b})`;
        verifyStatus.className = "bad";
      }
    } finally {
      setBusy(false);
    }
  });
}

main();
