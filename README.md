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
