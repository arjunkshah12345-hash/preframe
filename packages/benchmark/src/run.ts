import { buildItems, defaultCount, WorkloadKind } from "./workloads.js";
import { BenchResult, runStrategy, StrategyName } from "./strategies.js";
import os from "node:os";

const STRATEGIES: StrategyName[] = [
  "sync",
  "fixed-chunk",
  "fixed-time",
  "settimeout-0",
  "ric",
  "scheduler-yield",
  "preframe",
];

const KINDS: WorkloadKind[] = ["uniform", "variable", "bursty", "large"];

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function p95(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!;
}

interface Agg {
  strategy: StrategyName;
  kind: WorkloadKind;
  runs: number;
  totalMsMedian: number;
  totalMsP95: number;
  maxBlockMedian: number;
  maxBlockP95: number;
  p95BlockMedian: number;
  yieldsMedian: number;
  overheadMedian: number;
  checksum: string;
  checksumOk: boolean;
}

async function measure(
  strategy: StrategyName,
  kind: WorkloadKind,
  iterations: number,
  warmup: number,
  seed: number,
): Promise<Agg> {
  const count = defaultCount(kind);
  const items = buildItems({ kind, count, seed });

  for (let w = 0; w < warmup; w++) {
    await runStrategy(strategy, items, kind, seed);
  }

  const results: BenchResult[] = [];
  for (let i = 0; i < iterations; i++) {
    results.push(await runStrategy(strategy, items, kind, seed));
  }

  const checksum = results[0]?.checksum ?? "";
  const allSame = results.every((r) => r.checksum === checksum);

  return {
    strategy,
    kind,
    runs: iterations,
    totalMsMedian: median(results.map((r) => r.totalMs)),
    totalMsP95: p95(results.map((r) => r.totalMs)),
    maxBlockMedian: median(results.map((r) => r.maxBlockMs)),
    maxBlockP95: p95(results.map((r) => r.maxBlockMs)),
    p95BlockMedian: median(results.map((r) => r.p95BlockMs)),
    yieldsMedian: median(results.map((r) => r.yields)),
    overheadMedian: median(results.map((r) => r.overheadMs)),
    checksum,
    checksumOk: allSame,
  };
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function pad(s: string, n: number): string {
  return (s + " ".repeat(Math.max(0, n))).slice(0, n);
}

function printTable(rows: Agg[], kind: WorkloadKind): void {
  const subset = rows.filter((r) => r.kind === kind);
  console.log(`\n## Workload: ${kind} (n=${defaultCount(kind)})`);
  console.log(
    pad("strategy", 18) +
      pad("total med", 12) +
      pad("maxBlock", 12) +
      pad("p95Block", 12) +
      pad("yields", 10) +
      pad("overhead", 12) +
      "checksum",
  );
  console.log("-".repeat(96));
  for (const r of subset) {
    console.log(
      pad(r.strategy, 18) +
        pad(fmt(r.totalMsMedian), 12) +
        pad(fmt(r.maxBlockMedian), 12) +
        pad(fmt(r.p95BlockMedian), 12) +
        pad(fmt(r.yieldsMedian, 0), 10) +
        pad(fmt(r.overheadMedian), 12) +
        `${r.checksum}${r.checksumOk ? "" : " MISMATCH"}`,
    );
  }
}

async function runAll(): Promise<void> {
  const iterations = Number(process.env.PREFRAME_BENCH_ITERS ?? 3);
  const warmup = Number(process.env.PREFRAME_BENCH_WARMUP ?? 1);
  const seed = 424242;

  console.log("PreFrame Benchmark Suite");
  console.log("========================");
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform} ${os.arch()} (${os.cpus()[0]?.model ?? "cpu"})`);
  console.log(`CPUs: ${os.cpus().length}`);
  console.log(`Iterations/strategy: ${iterations} (warmup ${warmup})`);
  console.log(`Seed: ${seed}`);
  console.log(
    "\nIntegrity rule: every strategy runs identical work; checksums must match within a workload.",
  );

  const probeItems = buildItems({ kind: "uniform", count: 2000, seed });
  const probes: string[] = [];
  for (const s of STRATEGIES) {
    const r = await runStrategy(s, probeItems, "uniform", seed);
    probes.push(r.checksum);
  }
  const probeOk = probes.every((c) => c === probes[0]);
  console.log(
    `\nCross-strategy checksum probe: ${probeOk ? "PASS" : "FAIL"} (${probes[0]})`,
  );
  if (!probeOk) {
    console.error("Checksum mismatch across strategies — aborting.");
    console.error(probes);
    process.exit(1);
  }

  const rows: Agg[] = [];
  for (const kind of KINDS) {
    const ref = await measure("sync", kind, 1, 0, seed);
    for (const strategy of STRATEGIES) {
      process.stdout.write(`  running ${kind}/${strategy}...\n`);
      const agg = await measure(strategy, kind, iterations, warmup, seed);
      if (agg.checksum !== ref.checksum) {
        console.error(
          `Checksum mismatch: ${strategy}/${kind} got ${agg.checksum}, expected ${ref.checksum}`,
        );
        agg.checksumOk = false;
      }
      rows.push(agg);
    }
    printTable(rows, kind);
  }

  const pf = rows.find((r) => r.kind === "variable" && r.strategy === "preframe");
  const fc = rows.find((r) => r.kind === "variable" && r.strategy === "fixed-chunk");
  if (pf && fc) {
    console.log("\n## Headline (variable workload)");
    console.log(
      `fixed-chunk maxBlock median: ${fmt(fc.maxBlockMedian)}ms | preframe: ${fmt(pf.maxBlockMedian)}ms`,
    );
    console.log(
      `fixed-chunk total median: ${fmt(fc.totalMsMedian)}ms | preframe: ${fmt(pf.totalMsMedian)}ms`,
    );
    console.log(
      "Note: PreFrame may lose on wall-clock throughput vs sync; the goal is lower max blocking time.",
    );
  }

  console.log("\nDone.");
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
