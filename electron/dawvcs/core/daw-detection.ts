import fs from 'fs'
import path from 'path'

export type DAW = 'Logic Pro X' | 'Ableton Live' | 'FL Studio' | 'Reaper' | 'Pro Tools' | 'Unknown'

// Project file extensions for each DAW
export const PROJECT_EXTENSIONS = ['.als', '.flp', '.logicx', '.rpp', '.ptx']

// Filename fragments that indicate an autosave/backup copy rather than the real project
const BACKUP_NAME_PATTERNS = [/autosave/i, /_bak\b/i, /-bak\b/i, /\.RPP-bak$/i]

// Cloud-sync conflict-copy patterns (Dropbox / Google Drive / OneDrive)
const CONFLICT_COPY_PATTERNS = [
  /\(conflicted copy[^)]*\)/i,
  /\(case conflict[^)]*\)/i,
  / \(\d+\)$/, // "Song (1).flp" -> basename "Song (1)"
]

/**
 * Determines whether a filename inside a project folder looks like a DAW
 * autosave/backup file or a cloud-sync conflict copy, rather than a real
 * project candidate. Used to keep noisy auto-generated files out of the
 * "which file is the project" decision.
 */
export function isIgnorableCandidateName(filename: string): boolean {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)

  if (BACKUP_NAME_PATTERNS.some(re => re.test(filename))) return true
  if (CONFLICT_COPY_PATTERNS.some(re => re.test(base))) return true

  return false
}

/**
 * Counts the number of DAW project files in a directory, excluding
 * known backup/autosave files, cloud-sync conflict copies, and any
 * filenames the caller has explicitly marked as ignored.
 * @param projectPath - Path to the project directory
 * @param ignoredFiles - Filenames (relative to projectPath) to exclude from the count
 * @returns Object with count and list of project files found
 */
export function countProjectFiles(projectPath: string, ignoredFiles: string[] = []): { count: number; files: string[] } {
  try {
    if (!fs.existsSync(projectPath)) {
      return { count: 0, files: [] }
    }

    const stats = fs.statSync(projectPath)
    if (!stats.isDirectory()) {
      return { count: 0, files: [] }
    }

    const contents = fs.readdirSync(projectPath)
    const ignoredSet = new Set(ignoredFiles)
    const projectFiles = contents.filter(file => {
      const ext = path.extname(file).toLowerCase()
      if (!PROJECT_EXTENSIONS.includes(ext)) return false
      if (ignoredSet.has(file)) return false
      if (isIgnorableCandidateName(file)) return false
      return true
    })

    return { count: projectFiles.length, files: projectFiles }
  } catch {
    return { count: 0, files: [] }
  }
}

export interface DAWDetectionResult {
  daw: DAW
  isValid: boolean
  error?: string
}

/**
 * Detects which DAW a project belongs to based on file/folder structure
 * @param projectPath - Path to the project file or folder
 * @returns DAWDetectionResult with detected DAW and validity status
 */
export function detectDAW(projectPath: string): DAWDetectionResult {
  try {
    // Check if path exists
    if (!fs.existsSync(projectPath)) {
      return {
        daw: 'Unknown',
        isValid: false,
        error: `Project path does not exist: ${projectPath}`
      }
    }

    const stats = fs.statSync(projectPath)
    const ext = path.extname(projectPath).toLowerCase()

    // Logic Pro X - .logicx is a directory (Apple Bundle/Package format)
    if (stats.isDirectory() && ext === '.logicx') {
      return {
        daw: 'Logic Pro X',
        isValid: true
      }
    }

    // FL Studio - can be either:
    // 1. A .flp file directly
    // 2. A directory containing a .flp file
    if (stats.isFile() && ext === '.flp') {
      return {
        daw: 'FL Studio',
        isValid: true
      }
    }

    // Reaper - can be either:
    // 1. A .rpp file directly
    // 2. A directory containing a .rpp file
    if (stats.isFile() && ext === '.rpp') {
      return {
        daw: 'Reaper',
        isValid: true
      }
    }

    // Pro Tools - can be either:
    // 1. A .ptx file directly
    // 2. A directory containing a .ptx file
    if (stats.isFile() && ext === '.ptx') {
      return {
        daw: 'Pro Tools',
        isValid: true
      }
    }

    // Check if directory contains FL Studio project
    if (stats.isDirectory()) {
      const contents = fs.readdirSync(projectPath)

      // Check for .logix subdirectory (Logic Pro X project folder)
      const logixFolders = contents.filter(item => {
        const itemPath = path.join(projectPath, item)
        try {
          return fs.statSync(itemPath).isDirectory() &&
            path.extname(item).toLowerCase() === '.logicx'
        } catch {
          return false
        }
      })

      // Only accept if there's exactly one .logix folder
      if (logixFolders.length === 1) {
        return {
          daw: 'Logic Pro X',
          isValid: true
        }
      } else if (logixFolders.length > 1) {
        return {
          daw: 'Unknown',
          isValid: false,
          error: 'Directory contains multiple .logix folders - ambiguous project structure'
        }
      }

      // Check for .flp file (FL Studio project file)
      const hasFlpFile = contents.some(file =>
        path.extname(file).toLowerCase() === '.flp'
      )

      if (hasFlpFile) {
        return {
          daw: 'FL Studio',
          isValid: true
        }
      }

      // Check for .rpp file (Reaper project file)
      const hasRppFile = contents.some(file =>
        path.extname(file).toLowerCase() === '.rpp'
      )

      if (hasRppFile) {
        return {
          daw: 'Reaper',
          isValid: true
        }
      }

      // Check for .ptx file (Pro Tools project file)
      const hasPtxFile = contents.some(file =>
        path.extname(file).toLowerCase() === '.ptx'
      )

      if (hasPtxFile) {
        return {
          daw: 'Pro Tools',
          isValid: true
        }
      }

      // Check for .als file (Ableton Live Set)
      const hasAlsFile = contents.some(file =>
        path.extname(file).toLowerCase() === '.als'
      )

      // Check for Ableton Project Info folder
      const hasProjectInfo = contents.some(item => {
        const itemPath = path.join(projectPath, item)
        return fs.statSync(itemPath).isDirectory() &&
          item === 'Ableton Project Info'
      })

      if (hasAlsFile || hasProjectInfo) {
        return {
          daw: 'Ableton Live',
          isValid: true
        }
      }

      return {
        daw: 'Unknown',
        isValid: false,
        error: 'Directory does not appear to be a valid DAW project'
      }
    }

    // Unknown file type
    return {
      daw: 'Unknown',
      isValid: false,
      error: `Unsupported file type: ${ext || 'no extension'}`
    }

  } catch (err) {
    return {
      daw: 'Unknown',
      isValid: false,
      error: `Error detecting DAW: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

/**
 * Lists the real project-file candidates in a directory: DAW files/bundles
 * matching PROJECT_EXTENSIONS, minus backups/autosaves/conflict copies and
 * anything the caller has explicitly ignored.
 */
export function getProjectFileCandidates(projectPath: string, ignoredFiles: string[] = []): string[] {
  return countProjectFiles(projectPath, ignoredFiles).files
}

export interface PrimaryFileResolution {
  primaryFile: string
  changed: boolean
  reason?: 'renamed' | 'migrated'
}

export class ProjectFileAmbiguityError extends Error {
  candidates: string[]
  constructor(message: string, candidates: string[]) {
    super(message)
    this.name = 'ProjectFileAmbiguityError'
    this.candidates = candidates
  }
}

/**
 * Resolves which file inside a project folder is "the" tracked project file.
 *
 * - If the previously tracked file still exists and is still a valid
 *   candidate, keeps it (no-op).
 * - If it's gone but exactly one candidate remains, treats that as a
 *   rename/first-migration and adopts it automatically.
 * - If there are zero or multiple candidates and no unambiguous choice can
 *   be made, throws so the caller can surface a picker/error to the user.
 */
export function resolvePrimaryFile(
  projectPath: string,
  current: { primaryFile?: string | null; ignoredFiles?: string[] }
): PrimaryFileResolution {
  const ignoredFiles = current.ignoredFiles || []
  const candidates = getProjectFileCandidates(projectPath, ignoredFiles)
  const existingPrimary = current.primaryFile || undefined

  if (existingPrimary && candidates.includes(existingPrimary)) {
    return { primaryFile: existingPrimary, changed: false }
  }

  if (candidates.length === 0) {
    throw new Error(
      existingPrimary
        ? `The tracked project file "${existingPrimary}" is missing and no replacement was found in the folder.`
        : 'No DAW project file found in this folder.'
    )
  }

  if (candidates.length === 1) {
    return {
      primaryFile: candidates[0],
      changed: true,
      reason: existingPrimary ? 'renamed' : 'migrated'
    }
  }

  throw new ProjectFileAmbiguityError(
    `Multiple project files found in folder (${candidates.join(', ')}). Choose one to track, or mark the others as ignored.`,
    candidates
  )
}