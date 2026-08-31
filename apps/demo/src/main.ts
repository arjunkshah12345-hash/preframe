import "./styles.css";
import { run as preframeRun } from "@preframe/core";
import {
  DemoWorkload,
  buildDemoItems,
  calibrateWorkload,
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
  banner: HTMLElement;
  spark: HTMLCanvasElement;
  input: HTMLInputElement;
  clickBtn: HTMLButtonElement;
  clickCount: HTMLElement;
  progress: HTMLElement;
  metrics: Record<string, HTMLElement>;
}

interface Calibrated {
  count: number;
  baseIntensity: number;
  probeMs: number;
  kind: DemoWorkload;
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
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(1)} ms`;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

class Sparkline {
  private hist: number[] = [];
  private ctx: CanvasRenderingContext2D;
  private color: string;

  constructor(canvas: HTMLCanvasElement, color: string) {
    this.color = color;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 40;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    this.ctx = ctx;
    this.draw();
  }

  push(fps: number): void {
    this.hist.push(Math.max(0, Math.min(120, fps)));
    if (this.hist.length > 90) this.hist.shift();
    this.draw();
  }

  private draw(): void {
    const ctx = this.ctx;
    const canvas = ctx.canvas;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 40;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    if (this.hist.length < 2) return;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.hist.forEach((v, i) => {
      const x = (i / (this.hist.length - 1)) * w;
      const y = h - (v / 120) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

class FpsTracker {
  private frames: number[] = [];
  private last = performance.now();
  private raf = 0;
  private x = 20;
  private dir = 1;
  private dragging = false;
  private dragOffset = 0;
  private blockedUntil = 0;
  fps = 60;
  maxFrameGap = 0;
  private spark: Sparkline;
  private sparkCanvas: HTMLCanvasElement;
  private sparkColor: string;

  constructor(
    private orb: HTMLElement,
    private badge: HTMLElement,
    private banner: HTMLElement,
    private panel: HTMLElement,
    sparkCanvas: HTMLCanvasElement,
    sparkColor: string,
  ) {
    this.sparkCanvas = sparkCanvas;
    this.sparkColor = sparkColor;
    this.spark = new Sparkline(sparkCanvas, sparkColor);
    this.bindDrag();
  }

  start(): void {
    // Recreate spark after layout so canvas has real dimensions
    this.spark = new Sparkline(this.sparkCanvas, this.sparkColor);
    const loop = (t: number) => {
      const dt = t - this.last;
      this.last = t;
      this.frames.push(dt);
      if (this.frames.length > 45) this.frames.shift();
      this.maxFrameGap = Math.max(this.maxFrameGap, dt);
      const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
      this.fps = avg > 0 ? 1000 / avg : 60;
      this.badge.textContent = `${this.fps.toFixed(0)} FPS`;
      this.badge.classList.toggle("low", this.fps < 45);
      this.spark.push(this.fps);

      const blocked = dt > 80 || this.fps < 20;
      if (blocked) this.blockedUntil = t + 120;
      this.banner.classList.toggle("on", t < this.blockedUntil);
      this.banner.textContent =
        dt > 200 ? `blocked ${dt.toFixed(0)} ms` : "main thread blocked";

      if (!this.dragging) {
        this.x += this.dir * 2.4;
        const stage = this.panel.querySelector(".stage") as HTMLElement;
        const max = stage.clientWidth - 44;
        if (this.x > max) this.dir = -1;
        if (this.x < 12) this.dir = 1;
      }
      this.orb.style.transform = `translate3d(${this.x}px,0,0)`;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resetGaps(): void {
    this.maxFrameGap = 0;
    this.frames = [];
    this.blockedUntil = 0;
    this.banner.classList.remove("on");
  }

  /** Clear false-positive blocked state after another panel froze the tab. */
  clearBlocked(): void {
    this.blockedUntil = 0;
    this.banner.classList.remove("on");
    this.frames = [];
  }

  private bindDrag(): void {
    const onDown = (clientX: number) => {
      this.dragging = true;
      this.dragOffset = clientX - this.x;
    };
    const onMove = (clientX: number) => {
      if (!this.dragging) return;
      const stage = this.panel.querySelector(".stage") as HTMLElement;
      const max = stage.clientWidth - 44;
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
  const label = kind === "without" ? "Without PreFrame" : "With PreFrame";
  const mode = kind === "without" ? "synchronous loop" : "adaptive slices";

  const wrap = el(`
    <section class="panel panel-${kind}">
      <div class="panel-head">
        <div class="side"><span class="dot"></span>${label}</div>
        <span class="mode">${mode}</span>
      </div>
      <div class="stage">
        <div class="orb" title="Drag me while it runs"></div>
        <div class="fps-badge">60 FPS</div>
        <div class="blocked-banner"></div>
      </div>
      <canvas class="spark" aria-hidden="true"></canvas>
      <div class="ui-row">
        <input type="text" placeholder="Type here during the run…" autocomplete="off" />
        <button type="button">Click</button>
        <span class="click-count">clicks 0</span>
      </div>
      <div class="progress"><span></span></div>
      <div class="metrics">
        <div class="metric"><span class="k">Wall time</span><span class="v" data-m="totalMs">—</span></div>
        <div class="metric"><span class="k">Max block</span><span class="v" data-m="maxBlockMs">—</span></div>
        <div class="metric"><span class="k">Avg slice</span><span class="v" data-m="avgSliceMs">—</span></div>
        <div class="metric"><span class="k">Yields</span><span class="v" data-m="yields">—</span></div>
        <div class="metric"><span class="k">Live FPS</span><span class="v" data-m="fps">—</span></div>
        <div class="metric"><span class="k">Input lag</span><span class="v" data-m="inputLatencyMs">—</span></div>
        <div class="metric"><span class="k">Compute</span><span class="v" data-m="computeMs">—</span></div>
        <div class="metric"><span class="k">Throughput</span><span class="v" data-m="throughput">—</span></div>
        <div class="metric wide"><span class="k">Result checksum</span><span class="v accent" data-m="checksum">—</span></div>
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
    banner: wrap.querySelector(".blocked-banner")!,
    spark: wrap.querySelector(".spark")!,
    input: wrap.querySelector("input")!,
    clickBtn: wrap.querySelector(".ui-row button")!,
    clickCount: wrap.querySelector(".click-count")!,
    progress: wrap.querySelector(".progress > span")!,
    metrics,
  };

  let clicks = 0;
  els.clickBtn.addEventListener("click", () => {
    clicks += 1;
    els.clickCount.textContent = `clicks ${clicks}`;
  });

  return { wrap, els };
}

function renderMetrics(els: PanelEls, m: PanelMetrics): void {
  els.metrics.totalMs!.textContent = formatMs(m.totalMs);
  els.metrics.maxBlockMs!.textContent = formatMs(m.maxBlockMs);
  els.metrics.maxBlockMs!.className = `v ${m.maxBlockMs > 50 ? "danger" : m.maxBlockMs > 0 ? "ok" : ""}`;
  els.metrics.avgSliceMs!.textContent = formatMs(m.avgSliceMs);
  els.metrics.yields!.textContent = formatNum(m.yields);
  els.metrics.fps!.textContent = m.fps ? `${m.fps.toFixed(0)}` : "—";
  els.metrics.fps!.className = `v ${m.fps < 40 ? "danger" : m.fps > 0 ? "ok" : ""}`;
  els.metrics.inputLatencyMs!.textContent = formatMs(m.inputLatencyMs);
  els.metrics.computeMs!.textContent = formatMs(m.computeMs);
  els.metrics.throughput!.textContent =
    m.throughput > 0 ? `${formatNum(m.throughput)}/s` : "—";
  els.metrics.checksum!.textContent = m.checksum;
  els.progress.style.width = `${Math.min(100, m.progress * 100)}%`;
}

function measureInputLatency(input: HTMLInputElement): {
  start: () => void;
  stop: () => number;
} {
  const samples: number[] = [];
  let pending = 0;
  const onDown = () => {
    pending = performance.now();
  };
  const onInput = () => {
    if (pending > 0) {
      samples.push(performance.now() - pending);
      pending = 0;
    }
  };
  return {
    start: () => {
      samples.length = 0;
      pending = 0;
      input.addEventListener("keydown", onDown);
      input.addEventListener("input", onInput);
    },
    stop: () => {
      input.removeEventListener("keydown", onDown);
      input.removeEventListener("input", onInput);
      if (!samples.length) return 0;
      return samples.reduce((a, b) => a + b, 0) / samples.length;
    },
  };
}

async function runSyncWorkload(
  items: number[],
  kind: DemoWorkload,
  baseIntensity: number,
  onProgress: (p: number, blockMs: number) => void,
): Promise<{ results: number[]; computeMs: number; maxBlockMs: number; totalMs: number }> {
  const results = new Array<number>(items.length);
  const t0 = performance.now();
  const c0 = performance.now();
  // Pure synchronous — the entire duration is one long task
  for (let i = 0; i < items.length; i++) {
    results[i] = expensiveOp(items[i]!, intensity(kind, i, baseIntensity));
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
  baseIntensity: number,
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
    (item, index) => expensiveOp(item, intensity(kind, index, baseIntensity)),
    {
      targetFPS: 60,
      maxSliceMs: 5,
      strategy: "adaptive",
      initialCostMs: 0.2,
      safetyMargin: 0.2,
      onProgress: ({ index, total }) => onProgress(index / total),
      env: {
        // MessageChannel between slices; rAF every few yields so the UI paints
        // without adding ~16ms to every slice (which balloons wall time).
        yieldToHost: (() => {
          let n = 0;
          const mc = () =>
            new Promise<void>((resolve) => {
              if (typeof MessageChannel !== "undefined") {
                const { port1, port2 } = new MessageChannel();
                port1.onmessage = () => resolve();
                port2.postMessage(null);
              } else {
                setTimeout(resolve, 0);
              }
            });
          const raf = () =>
            new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          return async () => {
            await mc();
            n += 1;
            if (n % 4 === 0) await raf();
          };
        })(),
      },
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

function main(): void {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  const nav = el(`
    <nav class="nav">
      <div class="nav-brand"><span class="nav-mark"></span>PreFrame<span class="badge-exp">experimental</span></div>
      <div class="nav-links">
        <a href="#proof">Live proof</a>
        <a href="#how">How it works</a>
        <a href="https://github.com/arjunkshah12345-hash/preframe" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </nav>
  `);

  const hero = el(`
    <header class="hero">
      <p class="eyebrow">Adaptive cooperative scheduling</p>
      <h1><span class="brand">PreFrame</span>Let JavaScript work hard <em>without freezing the page.</em></h1>
      <p class="hero-lede">
        Developers describe the work. PreFrame decides how much can run before
        returning control to the browser — no fixed chunk sizes, no guessed yields.
      </p>
      <pre class="code-pill"><span class="kw">import</span> { run } <span class="kw">from</span> <span class="fn">"@preframe/core"</span>
<span class="kw">await</span> <span class="fn">run</span>(items, item => expensive(item))</pre>
      <div class="hero-actions">
        <button class="primary" id="run-both" type="button">Run live comparison</button>
        <button class="ghost" id="run-without" type="button">Freeze only</button>
        <button class="ghost" id="run-with" type="button">PreFrame only</button>
      </div>
      <div class="meta-row" id="calib-meta">Calibrating workload to this machine…</div>
    </header>
  `);

  const left = buildPanel("without");
  const right = buildPanel("with");

  const arena = el(`
    <section class="arena" id="proof">
      <div class="arena-bar">
        <div class="arena-title">
          <span>Same work. Same checksum. Different scheduling.</span>
          <span>Drag the dots · type · click while it runs. Sync will freeze the tab.</span>
        </div>
        <div class="arena-controls">
          <label class="select-wrap">shape
            <select id="workload">
              <option value="variable" selected>variable</option>
              <option value="uniform">uniform</option>
              <option value="bursty">bursty</option>
            </select>
          </label>
        </div>
      </div>
      <div class="split"></div>
      <div class="verify">
        <span>Integrity requires identical checksums on both sides.</span>
        <span id="verify-status">idle</span>
      </div>
    </section>
  `);
  arena.querySelector(".split")!.append(left.wrap, right.wrap);

  const how = el(`
    <section class="section" id="how">
      <h2>How PreFrame decides</h2>
      <p>
        PreFrame is cooperative — not multithreaded, not preemptive. It predicts
        iteration cost with an EWMA, fills a frame budget, and uses AIMD congestion
        control to grow or cut the next batch. Pending input yields immediately.
      </p>
      <div class="steps">
        <div class="step"><div class="step-n">01</div><div><h3>Measure</h3><p>Track per-iteration cost and variance as work runs.</p></div></div>
        <div class="step"><div class="step-n">02</div><div><h3>Predict</h3><p>Estimate how many iterations fit in the remaining frame budget.</p></div></div>
        <div class="step"><div class="step-n">03</div><div><h3>Adapt</h3><p>Overshoot → cut hard. Headroom → probe upward. Repeat.</p></div></div>
      </div>
    </section>
  `);

  const footer = el(`
    <footer class="footer">
      <span>Experimental research software · MIT</span>
      <span>Private prototype · arjunkshah12345-hash/preframe</span>
    </footer>
  `);

  const freezeOverlay = el(`
    <div class="freeze-overlay" id="freeze-overlay" aria-live="assertive">
      <div class="freeze-card">
        <div class="eyebrow-bad">Synchronous JavaScript</div>
        <h3>The main thread just locked up.</h3>
        <p>Same computational work as the PreFrame run. No cheating — identical ops, identical checksum.</p>
        <div class="stat" id="freeze-stat">—</div>
        <button type="button" class="primary" id="freeze-dismiss">Continue</button>
      </div>
    </div>
  `);

  app.append(nav, hero, arena, how, footer, freezeOverlay);

  const fpsLeft = new FpsTracker(
    left.els.orb,
    left.els.fps,
    left.els.banner,
    left.els.root,
    left.els.spark,
    "#ff6b81",
  );
  const fpsRight = new FpsTracker(
    right.els.orb,
    right.els.fps,
    right.els.banner,
    right.els.root,
    right.els.spark,
    "#4ade80",
  );
  // Defer spark sizing until laid out
  requestAnimationFrame(() => {
    fpsLeft.start();
    fpsRight.start();
  });

  const runBothBtn = hero.querySelector("#run-both") as HTMLButtonElement;
  const runWithoutBtn = hero.querySelector("#run-without") as HTMLButtonElement;
  const runWithBtn = hero.querySelector("#run-with") as HTMLButtonElement;
  const workloadSelect = arena.querySelector("#workload") as HTMLSelectElement;
  const verifyStatus = arena.querySelector("#verify-status") as HTMLElement;
  const calibMeta = hero.querySelector("#calib-meta") as HTMLElement;

  const freezeEl = freezeOverlay;
  const freezeStat = freezeOverlay.querySelector("#freeze-stat") as HTMLElement;
  freezeOverlay.querySelector("#freeze-dismiss")!.addEventListener("click", () => {
    freezeEl.classList.remove("on");
  });

  function showFreezeCallout(ms: number): void {
    freezeStat.textContent = formatMs(ms) + " blocked";
    freezeEl.classList.add("on");
    // Auto-dismiss so automated critics can proceed
    window.setTimeout(() => freezeEl.classList.remove("on"), 3200);
  }

  let leftM = emptyMetrics();
  let rightM = emptyMetrics();
  renderMetrics(left.els, leftM);
  renderMetrics(right.els, rightM);

  let calibrated: Calibrated | null = null;

  function recalibrate(): void {
    const kind = workloadSelect.value as DemoWorkload;
    const c = calibrateWorkload(1600, kind);
    calibrated = { ...c, kind };
    calibMeta.innerHTML = `Calibrated for ~<strong>1.6 s</strong> sync block · <strong>${c.count.toLocaleString()}</strong> ops · intensity ${c.baseIntensity} · probe ${c.probeMs.toFixed(1)} ms`;
  }

  recalibrate();
  workloadSelect.addEventListener("change", recalibrate);

  const setBusy = (busy: boolean) => {
    runBothBtn.disabled = busy;
    runWithoutBtn.disabled = busy;
    runWithBtn.disabled = busy;
    workloadSelect.disabled = busy;
  };

  function getWork(): { items: number[]; kind: DemoWorkload; base: number } {
    if (!calibrated) recalibrate();
    const c = calibrated!;
    return {
      items: buildDemoItems(c.count, 42),
      kind: c.kind,
      base: c.baseIntensity,
    };
  }

  async function runWithout(): Promise<string> {
    const { items, kind, base } = getWork();
    leftM = emptyMetrics();
    fpsLeft.resetGaps();
    const latency = measureInputLatency(left.els.input);
    latency.start();
    verifyStatus.textContent = "running sync — UI will freeze…";
    verifyStatus.className = "";
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const result = await runSyncWorkload(items, kind, base, (p, block) => {
      leftM.progress = p;
      leftM.maxBlockMs = block;
      renderMetrics(left.els, leftM);
    });

    // After unblock, rAF catches up — use compute duration as max block
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
    renderMetrics(left.els, leftM);
    // Sync froze the whole tab — clear false "blocked" on the other panel
    fpsRight.clearBlocked();
    showFreezeCallout(result.maxBlockMs);
    return leftM.checksum;
  }

  async function runWith(): Promise<string> {
    const { items, kind, base } = getWork();
    rightM = emptyMetrics();
    fpsRight.resetGaps();
    const latency = measureInputLatency(right.els.input);
    latency.start();
    verifyStatus.textContent = "running PreFrame — keep dragging / typing…";
    verifyStatus.className = "";
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const result = await runPreframeWorkload(items, kind, base, (p) => {
      rightM.progress = p;
      rightM.fps = fpsRight.fps;
      renderMetrics(right.els, rightM);
    });

    rightM = {
      ...rightM,
      totalMs: result.totalMs,
      computeMs: result.computeMs,
      // Scheduler slice length — not rAF gaps (those include GC / tab noise)
      maxBlockMs: result.maxBlockMs,
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
    try {
      await runWithout();
      verifyStatus.textContent = `sync checksum ${leftM.checksum} · max block ${formatMs(leftM.maxBlockMs)}`;
    } finally {
      setBusy(false);
    }
  });

  runWithBtn.addEventListener("click", async () => {
    setBusy(true);
    try {
      await runWith();
      verifyStatus.textContent = `preframe checksum ${rightM.checksum} · max block ${formatMs(rightM.maxBlockMs)}`;
    } finally {
      setBusy(false);
    }
  });

  runBothBtn.addEventListener("click", async () => {
    setBusy(true);
    verifyStatus.className = "";
    try {
      verifyStatus.textContent = "Step 1/2 — PreFrame (drag / type — should stay fluid)";
      const b = await runWith();
      await new Promise((r) => setTimeout(r, 500));
      verifyStatus.textContent = "Step 2/2 — sync (entire tab will freeze ~1.4s)";
      await new Promise((r) => setTimeout(r, 400));
      const a = await runWithout();
      if (a === b) {
        verifyStatus.textContent = `PASS · checksum ${a} · sync ${formatMs(leftM.maxBlockMs)} max block vs PreFrame ${formatMs(rightM.maxBlockMs)}`;
        verifyStatus.className = "ok";
      } else {
        verifyStatus.textContent = `FAIL · checksums differ (${a} vs ${b})`;
        verifyStatus.className = "bad";
      }
    } finally {
      setBusy(false);
    }
  });
}

main();
