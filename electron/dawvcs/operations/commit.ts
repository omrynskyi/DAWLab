import { getAllFiles } from '../core/fs-utils'
import { storeInCasSync } from '../core/cas'
import { loadLocalProjectLog, saveProjectLog, addCommitToLog } from '../core/log'
import { FileMapEntry } from '../types'
import { resolvePrimaryFile } from '../core/daw-detection'
import { getProjectPath } from '../core/registry'
import { saveCommit, getCommitPath } from '../core/commits'
import { getProjectStorageDirs } from '../core/storage-location'
import { extractMetadataInBackground } from '../../workers/metadataManager'
import fs from 'fs'
import path from 'path'

/**
 * Snapshots the current on-disk project state into CAS + a commit directory and
 * returns the identifiers, WITHOUT recording anything in the branch log. Shared
 * by both a real commit and an auto-captured draft so they capture files identically.
 *
 * May mutate + persist `log.primaryFile` if the resolved primary file changed.
 */
async function snapshotProjectFiles(
  projectName: string,
  log: any,
  projectPath: string,
  opts: { previewFile?: string } = {}
): Promise<{ commitId: string; timestamp: string; numFiles: number; previewHash?: string; commitsDir: string }> {
  // Only folders can hold more than one candidate file; a direct file/bundle
  // path (e.g. a .logicx) is unambiguous by construction.
  if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
    const resolution = resolvePrimaryFile(projectPath, {
      primaryFile: log.primaryFile,
      ignoredFiles: log.ignoredFiles,
    })
    if (resolution.changed) {
      log.primaryFile = resolution.primaryFile
      saveProjectLog(projectName, log)
    }
  }

  const { casDir, commitsDir } = getProjectStorageDirs(projectName)

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  const files = await getAllFiles(projectPath, log.ignoredFiles || [])

  const fileMap: FileMapEntry[] = []
  for (const [rel, full] of Object.entries(files)) {
    const hash = full !== 'empty' ? storeInCasSync(full, casDir) : 'empty'
    fileMap.push({ path: rel, hash })
  }

  // Handle preview file as a CAS object
  let previewHash: string | undefined
  if (opts.previewFile && fs.existsSync(opts.previewFile)) {
    previewHash = storeInCasSync(opts.previewFile, casDir)
  }

  const commitId = timestamp
  saveCommit(projectName, commitId, fileMap, commitsDir)

  return { commitId, timestamp, numFiles: fileMap.length, previewHash, commitsDir }
}

// Removes a previously-captured draft's commit directory and clears the log's
// draft pointer. Skips deleting the directory when it is the one we just turned
// into a real commit (same id — e.g. a draft and commit within the same second).
function clearDraft(projectName: string, log: any, commitsDir: string, keepCommitId?: string) {
  const draft = log.draft
  if (!draft) return
  if (draft.commit_id !== keepCommitId) {
    try {
      fs.rmSync(getCommitPath(projectName, draft.commit_id, commitsDir), { recursive: true, force: true })
    } catch (err) {
      console.warn('[commit] Failed to remove draft commit dir:', err)
    }
  }
  log.draft = null
}

export async function commitProject(
  projectName: string,
  message = 'No message',
  branch_name: string = 'main',
  author: string,
  opts: { previewFile?: string } = {}
) {
  if (!message || message.trim() === '') throw new Error('Commit message cannot be empty')

  const log = loadLocalProjectLog(projectName)
  if (!log) throw new Error(`Project '${projectName}' not found`)

  if (!log.branches?.find((b: any) => b.name === branch_name)) {
    throw new Error(`Branch '${branch_name}' does not exist`)
  }

  const projectPath = getProjectPath(projectName)
  if (!projectPath || projectPath === '/' || projectPath === 'NA') {
    throw new Error(`Project path not found for '${projectName}'. Please set the project path in settings.`)
  }

  const { commitId, timestamp, numFiles, previewHash, commitsDir } =
    await snapshotProjectFiles(projectName, log, projectPath, opts)

  addCommitToLog(log, branch_name, {
    commit_id: commitId,
    timestamp,
    message,
    author,
    ...(previewHash ? { preview_file: previewHash } : {})
  })

  // A real commit supersedes any pending auto-captured draft.
  clearDraft(projectName, log, commitsDir, commitId)

  log.lastCheckout = { commitId, timestamp }
  saveProjectLog(projectName, log)

  extractMetadataInBackground(projectName, projectPath, commitId, log.daw)

  return { commitId, numFiles }
}

/**
 * Auto-captures the current project state as a single unnamed draft snapshot, so
 * unsaved DAW work is safely on disk before the user writes a commit message.
 * Kept out of the branch log (invisible in history) and overwrites any prior
 * draft. Does NOT touch `lastCheckout`, so the "unsaved changes" state persists
 * until the user names it into a real commit.
 */
export async function captureDraft(
  projectName: string,
  branch_name = 'main',
  author = ''
): Promise<{ commitId: string; timestamp: string } | { skipped: true }> {
  const log = loadLocalProjectLog(projectName)
  if (!log) throw new Error(`Project '${projectName}' not found`)

  const projectPath = getProjectPath(projectName)
  if (!projectPath || projectPath === '/' || projectPath === 'NA' || !fs.existsSync(projectPath)) {
    return { skipped: true }
  }

  const { commitId, timestamp, commitsDir } = await snapshotProjectFiles(projectName, log, projectPath)

  // Overwrite the previous draft: drop its commit dir unless it's the same id
  // we just wrote (same-second re-capture reuses the directory).
  const prev = log.draft
  if (prev && prev.commit_id !== commitId) {
    try {
      fs.rmSync(getCommitPath(projectName, prev.commit_id, commitsDir), { recursive: true, force: true })
    } catch (err) {
      console.warn('[captureDraft] Failed to remove previous draft:', err)
    }
  }

  log.draft = { commit_id: commitId, timestamp }
  saveProjectLog(projectName, log)

  // Best-effort: intentionally omit author from persisted draft; `author` is
  // accepted for symmetry with commitProject and future use.
  void author
  void branch_name

  return { commitId, timestamp }
}

// Backward-compat alias used by init.ts and older IPC paths until Phase 5 cleanup
export async function commitProjectLocal(
  projectName: string,
  message = 'No message',
  branch_name = 'main',
  author: string
) {
  return commitProject(projectName, message, branch_name, author)
}

export async function addPreviewToCommit(projectName: string, commitId: string, previewFilePath: string) {
  if (!fs.existsSync(previewFilePath)) throw new Error('Preview file does not exist')

  const log = loadLocalProjectLog(projectName)
  if (!log) throw new Error('Project log not found')

  const { casDir, commitsDir } = getProjectStorageDirs(projectName)
  const commitPath = getCommitPath(projectName, commitId, commitsDir)
  if (!fs.existsSync(commitPath)) throw new Error(`Commit directory not found: ${commitPath}`)

  // Hash into CAS and copy to commit dir for local preview serving
  const previewHash = storeInCasSync(previewFilePath, casDir)
  const previewFileName = previewHash
  fs.copyFileSync(previewFilePath, path.join(commitPath, previewFileName))

  // Record hash in log
  let found = false
  for (const branch of log.branches ?? []) {
    const commit = branch.commits.find((c: any) => String(c.commit_id) === String(commitId))
    if (commit) {
      commit.preview_file = previewHash
      found = true
      break
    }
  }
  if (!found) throw new Error(`Commit ${commitId} not found in project log`)

  saveProjectLog(projectName, log)

  return { success: true, preview_file: previewHash }
}
