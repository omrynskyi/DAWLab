import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

import { CAS_DIR, COMMITS_DIR } from './constants'
export { CAS_DIR }

// ============================================================================
// LOCAL CAS — content-addressable storage on disk
// ============================================================================

export function ensureCasDir(casDir: string = CAS_DIR) {
  fs.mkdirSync(casDir, { recursive: true })
}

export function hashFileSync(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

export function storeInCasSync(filePath: string, casDir: string = CAS_DIR): string {
  const hash = hashFileSync(filePath)
  const casPath = getCasPath(hash, casDir)
  if (!fs.existsSync(casPath)) {
    fs.mkdirSync(path.dirname(casPath), { recursive: true })
    fs.copyFileSync(filePath, casPath)
  }
  return hash
}

export function getCasPath(hash: string, casDir: string = CAS_DIR): string {
  return path.join(casDir, hash.slice(0, 2), hash.slice(2, 4), hash)
}

export function restoreFile(hash: string, targetPath: string, casDir: string = CAS_DIR) {
  if (hash === 'empty') {
    fs.mkdirSync(targetPath, { recursive: true })
    return
  }
  const casPath = getCasPath(hash, casDir)
  if (!fs.existsSync(casPath)) {
    throw new Error(`Missing CAS object for hash ${hash}`)
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(casPath, targetPath)
}

export function calculateCasSize(casDir: string = CAS_DIR): number {
  if (!fs.existsSync(casDir)) return 0
  let total = 0
  const walk = (dir: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else try { total += fs.statSync(full).size } catch { /* skip */ }
      }
    } catch { /* skip unreadable dirs */ }
  }
  walk(casDir)
  return total
}

// ============================================================================
// HASH CLEANUP FOR PROJECT DELETION
// ============================================================================

export function getProjectHashes(projectName: string, commitsDir: string = COMMITS_DIR): Set<string> {
  const hashes = new Set<string>()
  const projectCommitsDir = path.join(commitsDir, projectName)
  if (!fs.existsSync(projectCommitsDir)) return hashes

  for (const commitId of fs.readdirSync(projectCommitsDir)) {
    const filemapPath = path.join(projectCommitsDir, commitId, 'filemap.json')
    if (fs.existsSync(filemapPath)) {
      try {
        const filemap = JSON.parse(fs.readFileSync(filemapPath, 'utf8'))
        for (const entry of filemap) {
          if (entry.hash && entry.hash !== 'empty') hashes.add(entry.hash)
        }
      } catch (err) {
        console.warn(`[cas.ts] Failed to parse filemap: ${filemapPath}`, err)
      }
    }
  }
  return hashes
}

export function getHashesInUseByOtherProjects(excludeProject: string, commitsDir: string = COMMITS_DIR): Set<string> {
  const hashesInUse = new Set<string>()
  if (!fs.existsSync(commitsDir)) return hashesInUse

  for (const projectName of fs.readdirSync(commitsDir)) {
    if (projectName === excludeProject) continue
    const projectCommitsDir = path.join(commitsDir, projectName)
    if (!fs.statSync(projectCommitsDir).isDirectory()) continue
    getProjectHashes(projectName, commitsDir).forEach(h => hashesInUse.add(h))
  }
  return hashesInUse
}

export function deleteOrphanedHashes(hashesToDelete: Set<string>, hashesInUse: Set<string>, casDir: string = CAS_DIR): number {
  let deletedCount = 0
  for (const hash of hashesToDelete) {
    if (hashesInUse.has(hash)) continue
    const casPath = getCasPath(hash, casDir)
    if (fs.existsSync(casPath)) {
      try {
        fs.unlinkSync(casPath)
        deletedCount++
        const sub2Dir = path.dirname(casPath)
        const sub1Dir = path.dirname(sub2Dir)
        if (fs.existsSync(sub2Dir) && fs.readdirSync(sub2Dir).length === 0) fs.rmdirSync(sub2Dir)
        if (fs.existsSync(sub1Dir) && fs.readdirSync(sub1Dir).length === 0) fs.rmdirSync(sub1Dir)
      } catch (err) {
        console.warn(`[cas.ts] Failed to delete hash file: ${casPath}`, err)
      }
    }
  }
  return deletedCount
}
