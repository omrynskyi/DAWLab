import fs from 'fs'
import { ensureCasDir } from '../core/cas'
import { registerProject, getProjectPath } from '../core/registry'
import { buildProjectLog, saveProjectLog } from '../core/log'
import { commitProjectLocal } from './commit'
import crypto from 'crypto'
import { detectDAW, getProjectFileCandidates, ProjectFileAmbiguityError } from '../core/daw-detection'
import { resolveStorageDirs, StorageMode } from '../core/storage-location'

export interface ProjectPathValidation {
  daw: string
  primaryFile: string | null
}

/**
 * Validates a project path and resolves which file inside it is the primary
 * DAW project file. When the folder holds more than one real candidate,
 * `opts.primaryFile` must name the caller's choice (surfaced via a picker in
 * the UI); `opts.ignoredFiles` excludes known-irrelevant candidates
 * (e.g. a second DAW's file, or a sketch not being tracked).
 */
export function validateProjectPath(
  projectPath: string,
  opts: { primaryFile?: string; ignoredFiles?: string[] } = {}
): ProjectPathValidation {
  const dawResult = detectDAW(projectPath)
  if (!dawResult.isValid) throw new Error(`Invalid project path: ${dawResult.error}`)

  // Logic Pro projects are themselves a single bundle/package - no ambiguity to resolve.
  if (fs.statSync(projectPath).isFile() || projectPath.toLowerCase().endsWith('.logicx')) {
    return { daw: dawResult.daw, primaryFile: null }
  }

  const ignoredFiles = opts.ignoredFiles || []
  const candidates = getProjectFileCandidates(projectPath, ignoredFiles)

  if (opts.primaryFile) {
    if (!candidates.includes(opts.primaryFile)) {
      throw new Error(`Selected project file "${opts.primaryFile}" was not found among the folder's project files.`)
    }
    return { daw: dawResult.daw, primaryFile: opts.primaryFile }
  }

  if (candidates.length === 1) {
    return { daw: dawResult.daw, primaryFile: candidates[0] }
  }

  if (candidates.length > 1) {
    throw new ProjectFileAmbiguityError(
      `Multiple project files found in folder (${candidates.join(', ')}). Choose one to track, or mark the others as ignored.`,
      candidates
    )
  }

  // No loose candidate files matched, but detectDAW was valid (e.g. Ableton's
  // "Ableton Project Info" folder without a loose .als at the top level).
  return { daw: dawResult.daw, primaryFile: null }
}

export async function initProject(projectName: string, projectPath: string, opts: any = {}) {
  const storageMode: StorageMode = opts.storageMode === 'project' ? 'project' : 'home'
  const { casDir } = resolveStorageDirs(storageMode, projectPath)
  ensureCasDir(casDir)
  const { daw, primaryFile } = validateProjectPath(projectPath, {
    primaryFile: opts.primaryFile,
    ignoredFiles: opts.ignoredFiles,
  })

  const existingPath = getProjectPath(projectName)
  if (existingPath) {
    throw new Error(`Project "${projectName}" already exists at: ${existingPath}. Please use a different project name or delete the existing project.`)
  }

  const projectID = crypto.randomUUID()
  const privacyFlag = 'local'
  const log = buildProjectLog(projectName, projectPath, {
    ...opts,
    projectID,
    daw,
    privacy_flag: privacyFlag,
    primaryFile,
    ignoredFiles: opts.ignoredFiles || [],
  })

  saveProjectLog(projectName, log)
  registerProject(projectID, projectName, projectPath, daw, undefined, undefined, undefined, undefined, privacyFlag, undefined, storageMode)

  await commitProjectLocal(projectName, 'Initial Commit', 'main', opts.author)

  return { success: true, projectId: projectID, projectName }
}
