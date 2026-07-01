# Infinite Autoclicker

A free, open-source, cross-platform auto-clicker and macro recorder. Build click
sequences, record real mouse/keyboard activity and replay it with original timing,
schedule runs, and detect on-screen targets by color. Small signed native binaries
(Tauri), trustworthy native feel.

**No telemetry. No nag screens. No network calls, ever.**

---

## Privacy guarantee

Infinite Autoclicker makes **zero outbound network connections**. No analytics, no
update phone-home, no crash reporting. There is no HTTP-client crate in the backend
and no `fetch`/`XMLHttpRequest`/`WebSocket` in the frontend bundle — and CI enforces
it (`bun run check:no-network` fails the build if any networking is introduced).
Screen capture used by the Color Trigger is processed locally and never transmitted.

## Features

- **Step Builder** — author click and drag steps without recording: position
  (manual or captured by hotkey), click type, count, delays, delay jitter, return
  cursor after click, and per-macro repeat (0 = infinite).
- **Recorder** — capture live input (clicks-only or full-motion with sampled
  movement, optional keyboard) and replay it with original timing.
- **Playback** — speed 0.25×–4×, repeat/infinite, accurate progress, instant stop.
- **Humanization (jitter)** — optional position, timing, and move-path randomization
  for naturalness. See the anti-cheat note below.
- **Color Trigger** — pick a target color with the eyedropper; the app clicks the
  centroid of the largest matching on-screen blob on an interval. Because it matches
  by *color*, it stays locked on targets that spin, shrink, or overlap — where static
  template matching fails.
- **Scheduler** — one-shot at a date/time, or an interval; weekly recurrence behind a
  setting. Scheduled runs require the app to stay open.
- **Global hotkeys** — record (F9), play/stop (F8), capture cursor (F6), panic (F12);
  all rebindable, work even when the window is not focused.
- **Failsafe** — a panic hotkey and a corner failsafe (slam the mouse into a screen
  corner) both abort playback within ~50 ms.
- **Library** — save/load macros as human-readable `.json`; rename, duplicate, delete.

## Anti-cheat reality

OS-level input synthesis is detectable regardless of jitter. Kernel anti-cheat
(Vanguard, EAC, BattlEye, and similar) identifies injected input by *how* it enters
the system, not by whether its timing looks human. Jitter only helps against naive
server-side "too regular" heuristics. **This app makes no attempt to evade
anti-cheat** and may get accounts banned in games that prohibit automation; that is
your risk. Humanization exists for naturalness and accessibility, not circumvention.

## Platform support

| Platform | Status | Notes |
|---|---|---|
| Windows 10/11 | Full | Per-monitor DPI awareness v2; multi-monitor + scaled displays handled. |
| macOS 12+ | Full, gated by permissions | Needs **Accessibility** (playback) and **Input Monitoring** (recording). Onboarding deep-links to the right System Settings panes and re-checks on focus. |
| Linux (X11) | Full | X11 only. |
| Linux (Wayland) | Out of scope (v1) | Wayland blocks global input capture/synthesis; the app detects this and shows a clear banner. |

If clicks land on the wrong pixel on a scaled multi-monitor setup, set the
environment variable `IAC_BACKEND=enigo` to switch the simulation backend.

## Build from source

Prerequisites: [Rust](https://rustup.rs), [Bun](https://bun.sh) (or Node 18+), and the
platform's Tauri prerequisites (WebView2 on Windows; Xcode CLT on macOS; webkit2gtk on
Linux).

```bash
bun install
bun run tauri dev        # run in development
bun run tauri build      # produce a release bundle

# Quality gates
bun run typecheck && bun run lint && bun run check:no-network
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

### End-to-end UI tests

E2E tests drive the real app window via WebDriver (`tauri-driver` → Edge Driver →
WebView2), so start/stop, recording, and navigation are tested for real. One-time
setup:

```bash
cargo install tauri-driver --locked
# Put an msedgedriver.exe matching your WebView2 version in .e2e/ (gitignored).
# Find your version under "…\Microsoft\EdgeWebView\Application\" and download from
# https://msedgedriver.microsoft.com/<version>/edgedriver_win64.zip
```

Then:

```bash
bun run build            # frontend
cd src-tauri && cargo build && cd ..   # embeds the frontend into the exe
bun run test:e2e         # launches the app and runs the UI scenarios
```

CI runs the same suite on Windows (see `.github/workflows/ci.yml`).

## File format

Macros are versioned, human-readable JSON — one timeline of timestamped events.
Built and recorded macros use the same format and the same playback engine.

## License

MIT. See [LICENSE](./LICENSE).
