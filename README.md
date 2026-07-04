# Infinite Autoclicker

A free auto clicker and macro recorder for Windows, Mac, and Linux.

It can click for you (as fast or as slow as you want), record your mouse and
keyboard and replay them exactly, click things by their color even when they
move, and run on a schedule.

No ads. No accounts. No internet connection, ever.

<div align="center">
  <br>
  <a href="https://github.com/danielrltan/Infinite-Autoclicker/releases/latest">
    <img src="https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20%20INSTALL%20NOW-Download%20the%20latest%20version-e8442e?style=for-the-badge" alt="Install now" height="44">
  </a>
  <br><br>
</div>

## Which file do I download?

Click the big button above, then pick the file for your computer:

| Your computer | Download this file |
|---|---|
| Windows 10 or 11 | The `.exe` setup file (or the `.msi`) |
| Mac (macOS 12 or newer) | The `.dmg` file |
| Linux | The `.AppImage` (works everywhere) or the `.deb` (Ubuntu/Debian) |

## How to install

### Windows

1. Download the `.exe` setup file and open it.
2. Windows may show a blue box that says "Windows protected your PC". That
   happens because this is a small free app without a paid publisher
   certificate, not because anything is wrong. Click **More info**, then
   **Run anyway**.
3. Click through the installer. Done. Open **Infinite Autoclicker** from the
   Start menu.

### Mac

1. Download the `.dmg` file and open it.
2. Drag the **Infinite Autoclicker** icon into the **Applications** folder.
3. The first time you open it, don't double click. Instead, **right click the
   app and choose Open**, then click **Open** again. You only have to do this
   once. (Macs do this for any app that isn't from the App Store.)
4. The app will ask for two permissions. This is normal and expected. See
   ["The Mac permission pop-ups"](#the-mac-permission-pop-ups-what-they-mean)
   below for what they mean.

### Linux

1. Download the `.AppImage` file.
2. Make it runnable, then start it:

   ```bash
   chmod +x Infinite-Autoclicker*.AppImage
   ./Infinite-Autoclicker*.AppImage
   ```

3. Heads up: it needs **X11**. On Wayland the system blocks all apps like this
   one, and the app will show a banner explaining that if it happens.

## The Mac permission pop-ups (what they mean)

On a Mac, the app can't click or watch your mouse until you allow it. That is
an Apple safety rule that applies to every automation app, and it is a good
rule. Here is exactly what each permission does:

- **Accessibility**: lets the app move your mouse and press keys. Without
  this, playback can't work. This is the "do clicks for me" permission.
- **Input Monitoring**: lets the app see your clicks and key presses so the
  **Record** button can work. This is the "watch what I do so I can replay it"
  permission.
- **Screen Recording** (only if you use the color features): lets the app look
  at the screen to find the color you picked. macOS will ask by itself the
  first time you use the eyedropper or a color step.

The app shows buttons that take you straight to the right settings page, and
it notices on its own once you've granted them. No restart needed in most
cases (Screen Recording sometimes wants one).

**Should I be worried?** Fair question. "Input Monitoring" sounds like spyware,
and in a bad app it could be. Here is why it's okay in this one:

- The app **cannot send anything anywhere**. There is no networking code in
  it at all, and our automated checks fail the build if anyone ever adds any.
  What it sees on your screen and keyboard stays on your computer.
- The code is public, right here in this repository. Anyone can read it.
- Recording only happens while you have pressed **Record**. The app is not
  logging you in the background.
- You can take the permissions back any time: System Settings > Privacy &
  Security > Accessibility (or Input Monitoring), and turn the switch off.

## How to use it

### Make it click (30 seconds)

1. Open the app. You start on the **Sequence** page.
2. Click **Add step** and pick **Click**.
3. Put your mouse where you want the click and press **F7**. That grabs the
   position.
4. Set how many clicks you want and the delay between them. Repeat = 0 means
   it clicks forever until you stop it.
5. Press **F6** (or the Play button). Press **F6** again to stop.

### Stop it in a hurry

Two panic buttons, always on:

- Press **F12**.
- Or slam your mouse into any corner of the screen.

Either one stops everything in a fraction of a second.

### Record yourself and replay it

1. Press **F5** (or the **Record** button).
2. Do the thing: click around, type, whatever you want repeated.
3. Press **F5** again to stop. Your actions become a step in the sequence.
4. Press **F6** to replay them with the same timing. You can speed playback
   up to 4x or slow it to 0.25x.

### Click something by its color

Two ways:

- Add a **click color** step to a sequence. At playback time it looks for that
  color on screen and clicks it, so it still works when the target has moved.
- Or use the **Color Trigger**: pick a color with the eyedropper and the app
  keeps clicking the biggest patch of that color on a timer. Great for targets
  that move, spin, or change size.

### Other things it does

- **Scheduler**: run a macro at a set time, or every X minutes. The app has to
  stay open for this.
- **Library**: save your macros as files, load them later, share them. They
  are plain JSON you can open in any text editor.
- **Humanize**: adds small random wobble to positions and timing so clicks
  look less robotic.

### Hotkeys

| Key | What it does |
|---|---|
| F5 | Start / stop recording |
| F6 | Play / stop |
| F7 | Capture mouse position |
| F12 | Panic stop |

All of them work even when the app window is in the background, and you can
change them in Settings.

## Is it safe?

- **It never touches the internet.** No analytics, no update checks, no crash
  reports. There is no networking code in the app, and the build fails
  automatically if anyone tries to add some (`bun run check:no-network`).
- **It's open source (MIT).** Everything the app does is in this repository
  for anyone to inspect.
- **Antivirus false alarms**: unsigned auto clickers sometimes get flagged by
  antivirus software because bad actors also automate input. If you downloaded
  it from this page, the flag is a false positive. If you don't trust a
  download, you can always build it from the source code yourself (see below).

## How to uninstall

- **Windows**: Settings > Apps > Infinite Autoclicker > Uninstall.
- **Mac**: drag the app from Applications to the Trash. Then, if you want,
  remove its entries in System Settings > Privacy & Security.
- **Linux**: delete the AppImage, or `sudo apt remove infinite-autoclicker`
  if you used the `.deb`.

## For developers

Built with Tauri (Rust backend, React frontend). Prerequisites:
[Rust](https://rustup.rs), [Bun](https://bun.sh) (or Node 18+), plus the
platform's Tauri prerequisites (WebView2 on Windows, Xcode CLT on macOS,
webkit2gtk on Linux).

```bash
bun install
bun run tauri dev        # run in development
bun run tauri build      # produce a release bundle

# Quality gates
bun run typecheck && bun run lint && bun run check:no-network
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Platform notes:

| Platform | Status |
|---|---|
| Windows 10/11 | Full support, per-monitor DPI awareness v2 |
| macOS 12+ | Full support, gated by the permissions described above |
| Linux (X11) | Full support |
| Linux (Wayland) | Not supported (Wayland blocks global input); the app detects it and says so |

If clicks land on the wrong pixel on a scaled multi-monitor setup, set
`IAC_BACKEND=enigo` to switch the input backend.

### End-to-end UI tests

E2E tests drive the real app window via WebDriver (`tauri-driver` > Edge
Driver > WebView2). One-time setup:

```bash
cargo install tauri-driver --locked
# Put an msedgedriver.exe matching your WebView2 version in .e2e/ (gitignored).
# Find your version under "...\Microsoft\EdgeWebView\Application\" and download from
# https://msedgedriver.microsoft.com/<version>/edgedriver_win64.zip
```

Then:

```bash
bun run tauri build --debug --no-bundle   # prod build: frontend embedded in the exe
bun run test:e2e                          # launches the app and runs the UI scenarios
```

A plain debug `cargo build` points the webview at the Vite dev server, so the
E2E app must be a production build (`--debug` keeps it fast, `--no-bundle`
skips installers). CI runs the same suite on Windows
(see `.github/workflows/ci.yml`).

### Macro file format

Macros are versioned, human-readable JSON: one timeline of timestamped events.
Built and recorded macros use the same format and the same playback engine.

### Releases

Pushing a tag like `v0.1.0` triggers `.github/workflows/release.yml`, which
builds installers for all three platforms and attaches them to a draft GitHub
release. Publish the draft to make the install button above point at it.

## License

MIT. See [LICENSE](./LICENSE).
