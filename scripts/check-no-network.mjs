#!/usr/bin/env node
// Privacy guarantee enforcement (SPEC §F9): fail the build if any networking
// capability is introduced. Checks (1) the Rust dependency deny-list and
// (2) the built frontend bundle for outbound-call primitives.
//
// Allow-list exceptions in v1: NONE.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = [];

// ── 1) Rust deny-list ──────────────────────────────────────────────
const DENIED_CRATES = [
  "reqwest",
  "ureq",
  "hyper-tls",
  "isahc",
  "surf",
  "attohttpc",
  "awc",
  "curl",
  "libcurl-sys",
  "tauri-plugin-http",
  "tauri-plugin-updater",
];

const cargoTomlPath = join(root, "src-tauri", "Cargo.toml");
if (existsSync(cargoTomlPath)) {
  const cargo = readFileSync(cargoTomlPath, "utf8");
  // Only inspect the [dependencies]/[*dependencies] sections, not comments.
  for (const crate of DENIED_CRATES) {
    const re = new RegExp(`^\\s*${crate.replace(/[-]/g, "[-_]")}\\s*=`, "m");
    if (re.test(cargo)) {
      failures.push(`Rust dependency "${crate}" is on the no-network deny-list (src-tauri/Cargo.toml).`);
    }
  }
} else {
  failures.push("src-tauri/Cargo.toml not found.");
}

// ── 2) Frontend bundle scan ────────────────────────────────────────
const BANNED_TOKENS = [
  "XMLHttpRequest",
  "WebSocket(",
  "EventSource(",
  "sendBeacon",
  "importScripts(",
  "fetch(", // any outbound fetch; modulepreload polyfill is disabled in vite.config
];

const distAssets = join(root, "dist", "assets");
if (existsSync(distAssets)) {
  const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith(".js"));
  if (jsFiles.length === 0) {
    console.warn("note: no JS assets in dist/assets - run `bun run build` first for a full check.");
  }
  for (const f of jsFiles) {
    const content = readFileSync(join(distAssets, f), "utf8");
    for (const token of BANNED_TOKENS) {
      if (content.includes(token)) {
        failures.push(`Bundle ${f} contains "${token}" - outbound network primitives are forbidden.`);
      }
    }
  }
} else {
  console.warn("note: dist/assets not found - bundle scan skipped (build first for full coverage).");
}

// ── Report ─────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error("\n✖ No-network check FAILED:\n");
  for (const f of failures) console.error("  - " + f);
  console.error("\nSee SPEC §F9. v1 ships zero outbound traffic.\n");
  process.exit(1);
}
console.log("✓ No-network check passed: no networking crates, no outbound primitives in the bundle.");
