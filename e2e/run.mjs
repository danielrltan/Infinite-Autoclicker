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
test("launches on the Auto Clicker tab", async (driver) => {
  await waitText(driver, "Auto Clicker");
  await waitText(driver, "Click interval");
});

test("tabs navigate", async (driver) => {
  await clickButton(driver, "Sequence");
  await waitText(driver, "Add step");
  await clickButton(driver, "Auto Clicker");
  await waitText(driver, "Click interval");
});

test("recording starts and STOPS (the reported bug)", async (driver) => {
  await clickButton(driver, "Sequence");
  await clickButton(driver, "Record ("); // "Record (F5)"
  // Backend flips status → the pill reads Recording and a Stop appears.
  await waitText(driver, "Recording");
  await clickButton(driver, "Stop"); // top-bar always-available Stop
  // Must return to idle + the Record button must be back.
  await waitText(driver, "Idle");
  await driver.wait(until.elementLocated(btn("Record (")), 10000);
});

test("adding a step works", async (driver) => {
  await clickButton(driver, "Sequence");
  await clickButton(driver, "Add step");
  await waitText(driver, "Edit step");
});

test("color step can be added to the sequence", async (driver) => {
  await clickButton(driver, "Sequence");
  await clickButton(driver, "Add step");
  await waitText(driver, "Edit step");
  // Open the Action dropdown (first Radix combobox in the editor) → Click color.
  const combos = await driver.findElements(By.css('button[role="combobox"]'));
  await combos[0].click();
  const opt = await driver.wait(
    until.elementLocated(By.xpath("//*[@role='option'][contains(normalize-space(.), 'Click color')]")),
    10000,
  );
  await opt.click();
  // The color editor fields appear.
  await waitText(driver, "Target color");
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
