import path from 'path'
import fs from 'fs'
import os from 'os'

import { loadProjectLog, saveProjectLog } from '../core/log'
import { getCommitFileMap } from '../core/commits'
import { restoreFile } from '../core/cas'
import { getProjectPath } from '../core/registry'
import { getProjectStorageDirs } from '../core/storage-location'

export async function rollbackProject(projectName: string, commitId: string, targetPath?: string) {
  const log = await loadProjectLog(projectName)
  if (!log) throw new Error(`Project '${projectName}' not initialized`)

  const projectPath = targetPath || getProjectPath(projectName)
  if (!projectPath || projectPath === 'NA') {
    throw new Error(`Project path not found for '${projectName}'. Please set the project path in settings.`)
  }

  // Safety: block dangerous paths
  const homeDir = os.homedir()
  const tmpDir = os.tmpdir()
  const isInTempDir = projectPath.startsWith(tmpDir) || projectPath.startsWith('/tmp/')
  const isDangerousPath = (
    projectPath === '/' ||
    projectPath === homeDir ||
    projectPath === path.dirname(homeDir) ||
    projectPath.startsWith('/etc') ||
    projectPath.startsWith('/usr') ||
    projectPath.startsWith('/bin') ||
    projectPath.startsWith('/sbin') ||
    projectPath.startsWith('/System') ||
    projectPath.startsWith('/Library')
  )
  const isCriticalPath = (
    projectPath === '/' ||
    projectPath === homeDir ||
    projectPath === path.dirname(homeDir)
  )
  if ((isCriticalPath || (isDangerousPath && !isInTempDir)) && !targetPath) {
    throw new Error(`CRITICAL SECURITY: Cannot rollback to dangerous path: ${projectPath}`)
  }

  const { casDir, commitsDir } = getProjectStorageDirs(projectName)
  const filemap = getCommitFileMap(projectName, commitId, commitsDir)

  // Restore files
  if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true })
  for (const { path: rel, hash } of filemap) {
    restoreFile(hash, path.join(projectPath, rel), casDir)
  }

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  log.lastCheckout = { commitId, timestamp }
  saveProjectLog(projectName, log)

  return { success: true }
}

// Backward-compat alias
export const rollbackProjectLocal = rollbackProject
