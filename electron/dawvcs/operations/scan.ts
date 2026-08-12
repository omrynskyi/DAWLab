import fs from 'fs'
import path from 'path'
import os from 'os'
import { promises as fsp } from 'fs'
import {
  DAW,
  PROJECT_EXTENSIONS,
  detectDAW,
  getProjectFileCandidates,
} from '../core/daw-detection'
import { getAllProjects } from '../core/registry'

export interface ScannedProject {
  /** The project directory to hand to initProject (matches the single-project flow). */
  path: string
  /** Suggested display name (folder basename). */
  name: string
  dawType: DAW
  /** The file inside the folder to track, when the folder has loose project files. */
  primaryFile?: string
  /** All real project-file candidates in the folder (>1 means the user should confirm). */
  candidates: string[]
  /** True when this path is already registered as a DAWLab project. */
  alreadyImported: boolean
}

export interface ScanProgress {
  scannedDirs: number
  found: number
  currentPath: string
}

// Directory names that are never worth walking during a drive scan: package
// caches, VCS metadata, DAW backups, system folders, and DAWLab's own storage.
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'Backup',
  'Project File Backups',
  '.dawlabproject',
  '.dawlab',
  'Library', // macOS/user Library — huge and never holds user projects
  'Applications',
  'System',
  '$RECYCLE.BIN',
  'AppData',
])

const DEFAULT_MAX_DEPTH = 8

/** Common folders where DAW projects tend to live, filtered to those that exist. */
export function getDefaultScanRoots(): string[] {
  const home = os.homedir()
  return ['Music', 'Documents', 'Desktop']
    .map((name) => path.join(home, name))
    .filter((dir) => {
      try {
        return fs.statSync(dir).isDirectory()
      } catch {
        return false
      }
    })
}

/**
 * Quick check on a directory's entries to decide whether it's worth running the
 * (heavier) detectDAW on it. Avoids a full detection pass on every folder.
 */
function looksLikeProjectDir(entries: fs.Dirent[]): boolean {
  return entries.some((e) => {
    if (e.isDirectory() && e.name === 'Ableton Project Info') return true
    const ext = path.extname(e.name).toLowerCase()
    return PROJECT_EXTENSIONS.includes(ext)
  })
}

/**
 * Recursively scans the given root folders for DAW projects, treating any
 * directory that DAWLab can detect as a project as a terminal node (it is not
 * descended into further). Emits progress as it walks.
 */
export async function scanForProjects(
  roots: string[],
  opts: {
    maxDepth?: number
    onProgress?: (progress: ScanProgress) => void
    shouldCancel?: () => boolean
  } = {},
): Promise<ScannedProject[]> {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const results: ScannedProject[] = []
  const seenDirs = new Set<string>()

  // Existing projects, keyed by resolved path, so we can flag re-imports.
  const importedPaths = new Set<string>()
  try {
    for (const p of getAllProjects()) {
      if (p.path && p.path !== 'NA') importedPaths.add(path.resolve(p.path))
    }
  } catch {
    // Registry may not exist yet on first run — nothing imported.
  }

  let scannedDirs = 0

  const record = (dir: string, daw: DAW) => {
    const resolved = path.resolve(dir)
    if (seenDirs.has(resolved)) return
    seenDirs.add(resolved)

    let candidates: string[] = []
    // Logic bundles have no loose candidate files to disambiguate.
    if (!(daw === 'Logic Pro X')) {
      try {
        candidates = getProjectFileCandidates(dir, [])
      } catch {
        candidates = []
      }
    }

    results.push({
      path: resolved,
      name: path.basename(resolved),
      dawType: daw,
      primaryFile: candidates.length > 0 ? candidates[0] : undefined,
      candidates,
      alreadyImported: importedPaths.has(resolved),
    })
  }

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (opts.shouldCancel?.()) return
    if (depth > maxDepth) return

    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return // permission denied / unreadable — skip
    }

    scannedDirs++
    if (scannedDirs % 25 === 0) {
      opts.onProgress?.({ scannedDirs, found: results.length, currentPath: dir })
    }

    // If this directory is itself a detectable project, record it and stop —
    // its subfolders are project content, not separate projects.
    if (looksLikeProjectDir(entries)) {
      const det = detectDAW(dir)
      if (det.isValid) {
        record(dir, det.daw)
        opts.onProgress?.({ scannedDirs, found: results.length, currentPath: dir })
        return
      }
    }

    for (const e of entries) {
      if (opts.shouldCancel?.()) return
      if (!e.isDirectory()) continue
      if (e.name.startsWith('.')) continue // hidden dirs (dotfiles) are noise
      if (SKIP_DIR_NAMES.has(e.name)) continue
      if (e.name.toLowerCase().endsWith('.logicx')) continue // Logic bundle, not a folder to walk
      if (e.isSymbolicLink()) continue // avoid symlink loops / escapes

      await walk(path.join(dir, e.name), depth + 1)
    }
  }

  for (const root of roots) {
    if (opts.shouldCancel?.()) break
    try {
      const resolvedRoot = path.resolve(root)
      if (fs.statSync(resolvedRoot).isDirectory()) {
        await walk(resolvedRoot, 0)
      }
    } catch {
      // Root doesn't exist or isn't readable — skip.
    }
  }

  opts.onProgress?.({ scannedDirs, found: results.length, currentPath: '' })
  return results
}
