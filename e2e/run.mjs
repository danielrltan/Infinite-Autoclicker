// End-to-end UI tests: drive the REAL app window via WebDriver (tauri-driver →
// msedgedriver → WebView2). Covers the flows that kept breaking — recording
// start/stop and the always-available Stop — so the app is tested, not the owner.
//
// Build the app first as a PRODUCTION bundle so the frontend is embedded (a plain
// debug `cargo build` points the webview at the Vite dev server and shows a blank
// error page when it isn't running):
//
//   bun run tauri build --debug --no-bundle
//   bun run test:e2e
//
// Overrides via env: APP_EXE, MSEDGEDRIVER, TAURI_DRIVER, WD_PORT.

import { spawn, spawnSync } from "node:child_process";
import { Builder, By, until } from "selenium-webdriver";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.WD_PORT || "4444";

const APP_EXE =
  process.env.APP_EXE ||
  path.join(ROOT, "src-tauri", "target", "debug", "infinite-autoclicker.exe");
const MSEDGEDRIVER =
  process.env.MSEDGEDRIVER || path.join(ROOT, ".e2e", "msedgedriver.exe");
const TAURI_DRIVER =
  process.env.TAURI_DRIVER ||
  path.join(homedir(), ".cargo", "bin", "tauri-driver.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function preflight() {
  const missing = [];
  if (!existsSync(APP_EXE))
    missing.push(`app binary: ${APP_EXE} (run: bun run tauri build --debug --no-bundle)`);
  if (!existsSync(MSEDGEDRIVER)) missing.push(`msedgedriver: ${MSEDGEDRIVER}`);
  if (!existsSync(TAURI_DRIVER)) missing.push(`tauri-driver: ${TAURI_DRIVER} (cargo install tauri-driver)`);
  if (missing.length) {
    console.error("E2E preflight failed:\n  - " + missing.join("\n  - "));
    process.exit(2);
  }
}

// ── tiny test harness ──────────────────────────────────────────────
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const btn = (text) =>
  By.xpath(`//button[contains(normalize-space(.), ${xpathLiteral(text)})]`);
const anyText = (text) =>
  By.xpath(`//*[contains(normalize-space(.), ${xpathLiteral(text)})]`);

function xpathLiteral(s) {
  if (!s.includes("'")) return `'${s}'`;
  return "concat('" + s.split("'").join("',\"'\",'") + "')";
}

async function clickButton(driver, text) {
  const el = await driver.wait(until.elementLocated(btn(text)), 10000);
  await driver.wait(until.elementIsVisible(el), 5000);
  await el.click();
}
async function waitText(driver, text, t = 10000) {
  await driver.wait(until.elementLocated(anyText(text)), t);
}
async function waitGone(driver, locator, t = 10000) {
  await driver.wait(async () => (await driver.findElements(locator)).length === 0, t);
}

// ── scenarios ──────────────────────────────────────────────────────
// One screen, no tabs, no popups: the auto-click card and the sequence are both
// always visible; color detection is a step.
test("launches on the workspace", async (driver) => {
  await waitText(driver, "Steps");
  await driver.wait(until.elementLocated(btn("Add step")), 10000);
  await driver.wait(until.elementLocated(btn("Play")), 10000);
});

test("auto-click card is inline (no popup)", async (driver) => {
  await waitText(driver, "Auto-click");
  await waitText(driver, "Click interval"); // shown right on the card
  await driver.wait(until.elementLocated(btn("Start")), 10000);
});

test("recording starts and STOPS (the reported bug)", async (driver) => {
  await clickButton(driver, "Record ("); // "Record (F4)"
  // Backend flips status → the pill reads Recording and a Stop appears.
  await waitText(driver, "Recording");
  await clickButton(driver, "Stop"); // the record toggle becomes Stop (F4)
  // Must return to idle + the Record button must be back.
  await waitText(driver, "Idle");
  await driver.wait(until.elementLocated(btn("Record (")), 10000);
});

test("adding a step works", async (driver) => {
  await clickButton(driver, "Add step");
  await waitText(driver, "Edit step");
});

test("color step can be added to the sequence", async (driver) => {
  await clickButton(driver, "Add step");
  await waitText(driver, "Edit step");
  // The step editor's Action select reads exactly "Click" for a new step
  // (distinct from the auto-click card's "Mouse click" combobox). Open it → Click color.
  const actionSelect = await driver.wait(
    until.elementLocated(By.xpath("//button[@role='combobox'][normalize-space(.)='Click']")),
    10000,
  );
  await actionSelect.click();
  const opt = await driver.wait(
    until.elementLocated(By.xpath("//*[@role='option'][contains(normalize-space(.), 'Click color')]")),
    10000,
  );
  await opt.click();
  // The color editor fields appear (incl. the folded-in search regions).
  await waitText(driver, "Target color");
  await waitText(driver, "Search regions");
});

// ── run ────────────────────────────────────────────────────────────
async function main() {
  preflight();
  console.log(`E2E: app=${path.basename(APP_EXE)} driver=${path.basename(MSEDGEDRIVER)}`);

  const td = spawn(TAURI_DRIVER, ["--port", PORT, "--native-driver", MSEDGEDRIVER], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  const cleanup = () => {
    try { td.kill(); } catch { /* ignore */ }
    // Kill the whole tree (msedgedriver child) on Windows.
    spawnSync("taskkill", ["/F", "/T", "/IM", "tauri-driver.exe"], { stdio: "ignore" });
    spawnSync("taskkill", ["/F", "/T", "/IM", "msedgedriver.exe"], { stdio: "ignore" });
    spawnSync("taskkill", ["/F", "/T", "/IM", "infinite-autoclicker.exe"], { stdio: "ignore" });
  };

  await sleep(2000); // let tauri-driver bind the port

  let driver;
  let failed = 0;
  try {
    driver = await new Builder()
      .usingServer(`http://127.0.0.1:${PORT}/`)
      .withCapabilities({ browserName: "wry", "tauri:options": { application: APP_EXE } })
      .build();

    for (const t of tests) {
      try {
        await t.fn(driver);
        console.log(`  ✓ ${t.name}`);
      } catch (e) {
        failed++;
        console.error(`  ✗ ${t.name}\n      ${String(e).split("\n")[0]}`);
      }
    }
  } catch (e) {
    console.error("E2E driver/session error:", e);
    failed = Math.max(failed, 1);
  } finally {
    if (driver) await driver.quit().catch(() => {});
    cleanup();
  }

  console.log(failed === 0 ? `\nE2E: all ${tests.length} passed` : `\nE2E: ${failed}/${tests.length} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
