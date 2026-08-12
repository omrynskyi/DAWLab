import fs from 'fs'
import path from 'path'
import { getCommitsDir } from '../core/constants'
import { getCasPath, CAS_DIR } from '../core/cas'
import { FileMapEntry } from '../types'

export interface CleanableFile {
  hash: string
  size: number
  filename: string // Just one filename for display (e.g. "drums.wav")
  projectNames: string[] // List of projects using this file
}

export interface CleanStats {
  filesDeleted: number
  bytesFreed: number
  errors: string[]
}

/**
 * Scans for CAS files that are safe to delete: hashes stored on disk that
 * aren't referenced by any commit filemap of any project still on record.
 * These are typically leftovers from projects that were deleted without a
 * full CAS sweep, or replaced preview files.
 *
 * Only sweeps the shared home CAS — projects using project-root storage
 * (.dawlabproject) have their own isolated CAS and aren't part of this pool.
 */
export function getCleanableFiles(): CleanableFile[] {
  const commitsRootDir = getCommitsDir()

  const keepHashes = new Set<string>()
  const usageMap = new Map<string, { filename: string, projects: Set<string> }>()

  if (fs.existsSync(commitsRootDir)) {
    const projectDirs = fs.readdirSync(commitsRootDir)
    for (const projectName of projectDirs) {
      const projectPath = path.join(commitsRootDir, projectName)
      if (!fs.statSync(projectPath).isDirectory()) continue

      const commits = fs.readdirSync(projectPath)
      for (const commitId of commits) {
        const filemapPath = path.join(projectPath, commitId, 'filemap.json')
        if (!fs.existsSync(filemapPath)) continue
        try {
          const filemap = JSON.parse(fs.readFileSync(filemapPath, 'utf8')) as FileMapEntry[]
          for (const entry of filemap) {
            if (!entry.hash || entry.hash === 'empty') continue
            keepHashes.add(entry.hash)
            if (!usageMap.has(entry.hash)) {
              usageMap.set(entry.hash, { filename: path.basename(entry.path), projects: new Set([projectName]) })
            } else {
              usageMap.get(entry.hash)!.projects.add(projectName)
            }
          }
        } catch (err) {
          console.warn(`[clean.ts] Failed to parse filemap: ${filemapPath}`, err)
        }
      }
    }
  }

  // Walk the CAS directory (two-level sha256 fanout) for stored hashes not in keepHashes
  const result: CleanableFile[] = []
  if (!fs.existsSync(CAS_DIR)) return result

  for (const sub1 of fs.readdirSync(CAS_DIR)) {
    const sub1Path = path.join(CAS_DIR, sub1)
    if (!fs.statSync(sub1Path).isDirectory()) continue
    for (const sub2 of fs.readdirSync(sub1Path)) {
      const sub2Path = path.join(sub1Path, sub2)
      if (!fs.statSync(sub2Path).isDirectory()) continue
      for (const hash of fs.readdirSync(sub2Path)) {
        if (keepHashes.has(hash)) continue
        const casPath = getCasPath(hash)
        try {
          const size = fs.statSync(casPath).size
          const info = usageMap.get(hash)
          result.push({
            hash,
            size,
            filename: info?.filename ?? hash,
            projectNames: info ? Array.from(info.projects) : [],
          })
        } catch { /* skip unreadable */ }
      }
    }
  }

  return result
}

export function cleanCasFiles(hashes: string[]): CleanStats {
    const stats: CleanStats = {
        filesDeleted: 0,
        bytesFreed: 0,
        errors: []
    }

    for (const hash of hashes) {
        try {
            const casPath = getCasPath(hash)
            if (fs.existsSync(casPath)) {
                const size = fs.statSync(casPath).size
                fs.unlinkSync(casPath)

                // Try to clean up empty parents
                try {
                    const d1 = path.dirname(casPath)
                    if (fs.readdirSync(d1).length === 0) fs.rmdirSync(d1)
                    const d2 = path.dirname(d1)
                     if (fs.readdirSync(d2).length === 0) fs.rmdirSync(d2)
                } catch (e) {}

                stats.filesDeleted++
                stats.bytesFreed += size
            }
        } catch (err: any) {
            stats.errors.push(`Failed to delete ${hash}: ${err.message}`)
        }
    }

    return stats
}
