# DAWLab

**Version control for music producers.** DAWLab is a Git-like version control system for DAW project files, packaged as a cross-platform desktop app. Snapshot your sessions, browse their history, branch ideas, and roll back — all **100% local**, with no account, no cloud, and no internet connection required.

Think of it as "Git for your Ableton / Logic / FL Studio projects," but built for how producers actually work.

---

## Features

- 🎛️ **DAW-aware versioning** — detects and tracks project files for Ableton Live, FL Studio, Logic Pro, Pro Tools, and Reaper.
- 📸 **Commits & history** — save named versions of a project and browse the full timeline in a visual commit graph.
- 🌱 **Branching & rollback** — explore alternate arrangements on a branch, then roll back to any previous version safely.
- 🔍 **Content-addressable storage** — files are deduplicated with SHA-256 CAS, so repeated saves don't bloat your disk.
- 🎧 **Previews & metadata** — extracts tempo, tracks, and plugin info, and can attach audio previews to versions.
- 💾 **Local-first** — everything lives on your machine in a `.dawlabproject` store. Your work never leaves your computer.

## Supported platforms

Desktop builds are produced for **macOS**, **Windows**, and **Linux**.

---

## Installation

### Prerequisites

- **Node.js ≥ 20.19** (or 22+) and **npm**
- Git

### Run from source (development)

```bash
# 1. Clone
git clone <your-fork-url> dawlab
cd dawlab

# 2. Install dependencies
npm install

# 3. Launch the desktop app in dev mode (Vite + Electron with hot reload)
npm run dev
```

That's it — no `.env` file, API keys, or sign-up needed. The app runs fully offline.

> **Optional:** to enable Sentry error reporting during development, create a `.env` file with `VITE_SENTRY_DSN=<your-dsn>`. It is safe to leave unset.

### Build a distributable app

```bash
# Type-check, bundle, and package installers for your current OS
npm run build
```

Packaged installers are written to `release/<version>/` (a `.dmg` on macOS, an `.exe` setup on Windows, an `.AppImage` on Linux).

To build only the renderer/main bundles without packaging an installer:

```bash
npm run build:renderer
```

---

## Running an unsigned build

The packaged apps are **not code-signed or notarized** (`electron-builder.json5` sets `identity: null` and ships an unsigned DMG). Your OS will therefore block the app on first launch. You have two options: bypass the warning once, or sign the app yourself.

### macOS

macOS Gatekeeper blocks unsigned apps with either *"DAWLab can't be opened because Apple cannot check it for malicious software"* or, on Apple Silicon, *"DAWLab is damaged and can't be opened"* (the "damaged" message is Gatekeeper's misleading wording for an unsigned/quarantined app — the app is fine).

**Option A — bypass Gatekeeper (quickest).** After moving `DAWLab.app` to `/Applications`, strip the quarantine attribute:

```bash
xattr -dr com.apple.quarantine /Applications/DAWLab.app
```

Then open it normally. (Right-click → **Open** → **Open** also works for the "unidentified developer" case, but not for the "damaged" case — use the command above for that.)

**Option B — ad-hoc sign it yourself (no Apple account needed).** An ad-hoc signature (`-` as the identity) satisfies the loader without any certificate. This is the simplest way to make an Apple Silicon build launchable:

```bash
xattr -dr com.apple.quarantine /Applications/DAWLab.app
codesign --force --deep --sign - /Applications/DAWLab.app
```

**Option C — sign with a real Apple Developer ID (for distribution).** If you have a paid Apple Developer account and a *Developer ID Application* certificate installed in your Keychain, you can produce a properly signed, notarizable app.

1. Find your identity:
   ```bash
   security find-identity -v -p codesigning
   # e.g. "Developer ID Application: Your Name (TEAMID)"
   ```
2. Let electron-builder sign during packaging by editing `electron-builder.json5`:
   ```json5
   mac: {
     identity: "Developer ID Application: Your Name (TEAMID)",
     hardenedRuntime: true,        // required for notarization
     gatekeeperAssess: false,
     entitlements: "entitlements.mac.plist",
     entitlementsInherit: "entitlements.mac.plist",
   },
   dmg: { sign: true },
   ```
   Then run `npm run build`.
3. Or sign a build you already packaged, by hand:
   ```bash
   codesign --force --deep --options runtime \
     --entitlements entitlements.mac.plist \
     --sign "Developer ID Application: Your Name (TEAMID)" \
     "release/<version>/mac/DAWLab.app"
   codesign --verify --deep --strict --verbose=2 "release/<version>/mac/DAWLab.app"
   ```
4. **Notarize** so other machines don't warn (requires an app-specific password or API key):
   ```bash
   xcrun notarytool submit "DAWLab-Mac-arm64-<version>-Installer.dmg" \
     --apple-id you@example.com --team-id TEAMID --password <app-specific-password> --wait
   xcrun stapler staple "DAWLab-Mac-arm64-<version>-Installer.dmg"
   ```

### Windows

Unsigned installers trigger a **SmartScreen** warning. To run anyway: click **More info** → **Run anyway**.

To sign it yourself you need a code-signing certificate (`.pfx`). Sign the packaged `.exe` with `signtool` from the Windows SDK:

```powershell
signtool sign /fd SHA256 /f certificate.pfx /p <password> ^
  /tr http://timestamp.digicert.com /td SHA256 ^
  "release\<version>\DAWLab-Windows-x64-<version>-Setup.exe"
```

Or let electron-builder sign automatically by setting `CSC_LINK` (path/URL to the `.pfx`) and `CSC_KEY_PASSWORD` before running `npm run build`.

### Linux

No signing required. Make the AppImage executable and run it:

```bash
chmod +x release/<version>/DAWLab-Linux-<version>.AppImage
./release/<version>/DAWLab-Linux-<version>.AppImage
```

---

## Development

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Electron app in development with hot reload |
| `npm run build` | Type-check, bundle, and package desktop installers |
| `npm run build:renderer` | Bundle renderer + main without packaging |
| `npm run lint` | ESLint (`--max-warnings 0`) |
| `npm run test:unit` | Run the test suite once (CI mode) |
| `npm run test` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with a coverage report |

### Tech stack

- **[Electron](https://www.electronjs.org/) 40** — desktop shell
- **[React](https://react.dev/) 18** + **[TypeScript](https://www.typescriptlang.org/)** — UI
- **[Vite](https://vite.dev/) 7** — build tooling (via `vite-plugin-electron`)
- **[Tailwind CSS](https://tailwindcss.com/)** — styling
- **[Vitest](https://vitest.dev/)** — testing

### Project structure

```
electron/            Electron main process (Node.js)
  main.ts            IPC handlers and app lifecycle
  preload.ts         Secure contextBridge to the renderer
  dawvcs/            The DAWLab version-control engine
    core/            Content-addressable storage, registry, logs, DAW detection
    operations/      init, commit, rollback, branch, clean, scan, ...
  workers/           Worker threads (metadata extraction, plugin scanning)
src/                 React renderer (no Node.js access)
  pages/             Library, History, Settings
  components/        UI components
  hooks/             Data + action hooks that call into IPC
  types/             Shared TypeScript types
```

The renderer never touches the filesystem directly — all disk and VCS work happens in the main process and is reached through typed IPC calls.

---

## Contributing

Contributions are welcome. Please run `npm run lint` and `npm run test:unit` before opening a pull request, and keep changes focused.

## License

Licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

You are free to **use, modify, and share** DAWLab for any **noncommercial** purpose — personal projects, learning, research, education, and nonprofit or government use. **Commercial use is not permitted**: you may not sell DAWLab, offer it as a paid product or service, or otherwise use it to make money. See the [LICENSE](LICENSE) file for the full terms.

> Note: this is a *source-available*, noncommercial license, not an OSI-approved open-source license (open-source licenses must permit commercial use).

Copyright © 2026 Oleg Mrynskyi.
