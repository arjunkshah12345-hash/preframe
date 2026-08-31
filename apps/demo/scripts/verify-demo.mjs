/**
 * Headless critic for the PreFrame demo.
 * Asserts freeze drama, PreFrame fluidity, checksum integrity, wall ratio,
 * and compositor handoff on the PreFrame orb during sync.
 */
import { chromium } from "playwright";

const url = process.env.PREFRAME_DEMO_URL ?? "http://localhost:5173/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#run-both");

  const calib = await page.locator("#calib-meta").innerText();
  console.log("calib:", calib.replace(/\s+/g, " "));

  await page.click("#run-with");
  const fpsSamples = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(120);
    const t = await page.locator(".panel-with .fps-badge").innerText();
    fpsSamples.push(parseFloat(t));
  }
  const midFps = Math.max(...fpsSamples);
  const midFpsText = `${midFps} FPS (max of ${fpsSamples.join(",")})`;
  console.log("preframe mid-run fps samples:", fpsSamples);

  await page.waitForFunction(
    () => {
      const el = document.querySelector('.panel-with [data-m="checksum"]');
      return el && el.textContent && el.textContent !== "—";
    },
    null,
    { timeout: 60000 },
  );

  const withMax = await page.locator('.panel-with [data-m="maxBlockMs"]').innerText();
  const withCs = await page.locator('.panel-with [data-m="checksum"]').innerText();
  const withYields = await page.locator('.panel-with [data-m="yields"]').innerText();
  console.log("preframe:", { withMax, withCs, withYields });

  // Compositor handoff must engage before / during sync freeze
  const compositorSeen = page.waitForFunction(
    () => !!document.querySelector(".panel-with .orb.css-alive"),
    null,
    { timeout: 5000 },
  );

  const t0 = Date.now();
  await page.click("#run-without");
  let sawCompositor = false;
  try {
    await compositorSeen;
    sawCompositor = true;
  } catch {
    sawCompositor = false;
  }

  await page.waitForFunction(
    () => {
      const el = document.querySelector('.panel-without [data-m="checksum"]');
      return el && el.textContent && el.textContent !== "—";
    },
    null,
    { timeout: 60000 },
  );
  const wall = Date.now() - t0;

  const syncMax = await page.locator('.panel-without [data-m="maxBlockMs"]').innerText();
  const syncCs = await page.locator('.panel-without [data-m="checksum"]').innerText();
  console.log("sync:", { syncMax, syncCs, wallMs: wall, sawCompositor });

  const dismiss = page.locator("#freeze-dismiss");
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }

  // After sync, JS motion should be restored
  await page.waitForTimeout(100);
  const stillCss = await page.locator(".panel-with .orb.css-alive").count();

  const withWall = await page.locator('.panel-with [data-m="totalMs"]').innerText();
  const syncWall = await page.locator('.panel-without [data-m="totalMs"]').innerText();
  console.log("walls:", { withWall, syncWall });

  // Delta banner should appear once both sides match
  const deltaOn = await page.locator("#delta.on").count();

  await page.screenshot({ path: "/tmp/preframe-gauntlet.png", fullPage: true });
  await browser.close();

  const parseMs = (s) => {
    if (s.includes("s") && !s.includes("ms")) return parseFloat(s) * 1000;
    return parseFloat(s);
  };

  const syncBlock = parseMs(syncMax);
  const preBlock = parseMs(withMax);
  const syncTotal = parseMs(syncWall);
  const preTotal = parseMs(withWall);
  const verdicts = [];

  if (errors.length) verdicts.push(`CONSOLE_ERRORS: ${errors.join(" | ")}`);
  if (syncCs !== withCs) verdicts.push(`CHECKSUM_MISMATCH ${syncCs} vs ${withCs}`);
  if (!(syncBlock >= 800)) verdicts.push(`SYNC_TOO_SHORT ${syncBlock}ms (want ≥800)`);
  if (!(preBlock <= 16)) verdicts.push(`PREFRAME_SLICE_HIGH ${preBlock}ms (want ≤16)`);
  if (!(midFps >= 40)) verdicts.push(`PREFRAME_FPS_LOW mid-run ${midFpsText} (want ≥40)`);
  if (preTotal > syncTotal * 1.6) {
    verdicts.push(`PREFRAME_WALL_BLOAT ${preTotal}ms vs sync ${syncTotal}ms (>1.6x)`);
  }
  if (!sawCompositor) verdicts.push("COMPOSITOR_HANDOFF_MISSING during sync prepare");
  if (stillCss > 0) verdicts.push("COMPOSITOR_STUCK after sync (expected JS motion restore)");
  if (!deltaOn) verdicts.push("DELTA_BANNER_MISSING after both runs");

  const ratio = preBlock > 0 ? syncBlock / preBlock : 0;
  console.log(`blocking reduction: ${ratio.toFixed(1)}×`);

  if (!verdicts.length) {
    console.log("CRITIC_VERDICT: PASS — freeze, fluid PreFrame, compositor handoff, tight wall");
    process.exit(0);
  }
  console.log("CRITIC_VERDICT: FAIL");
  for (const v of verdicts) console.log(" -", v);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
