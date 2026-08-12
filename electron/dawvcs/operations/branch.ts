import { loadProjectLog, loadLocalProjectLog, saveProjectLog, addCommitToLog } from '../core/log'
import { getCommitFileMap, saveCommit } from '../core/commits'
import { storeInCasSync } from '../core/cas'
import { getAllFiles } from '../core/fs-utils'
import { FileMapEntry } from '../types'
import { getProjectPath } from '../core/registry'
import { getProjectStorageDirs } from '../core/storage-location'

const VALID_BRANCH_NAME = /^[a-zA-Z0-9_ \-'/]+$/

export async function createBranch(
  projectName: string,
  newBranch: string,
  fromCommit?: string,
  author?: string
) {
  if (!newBranch || newBranch.trim() === '') throw new Error('Branch name cannot be empty')
  if (!VALID_BRANCH_NAME.test(newBranch)) {
    throw new Error(`Branch name '${newBranch}' contains invalid characters. Only alphanumeric characters, spaces, hyphens, underscores, apostrophes, and slashes are allowed.`)
  }

  const log = await loadProjectLog(projectName)
  if (!log) throw new Error('project log not found')

  if (log.branches?.find((b: any) => b.name === newBranch)) {
    throw new Error(`Branch '${newBranch}' already exists.`)
  }

  if (!log.branches) log.branches = []
  log.branches.push({ name: newBranch, commits: [] })
  saveProjectLog(projectName, log)

  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  const commitId = timestamp
  const { casDir, commitsDir } = getProjectStorageDirs(projectName)

  if (fromCommit) {
    const fileMap = getCommitFileMap(projectName, fromCommit, commitsDir)
    const commitMessage = `Created branch ${newBranch} from commit ${fromCommit}`

    saveCommit(projectName, commitId, fileMap, commitsDir)

    const updatedLog = loadLocalProjectLog(projectName)
    if (!updatedLog) throw new Error('project log not found')
    addCommitToLog(updatedLog, newBranch, { commit_id: commitId, timestamp, message: commitMessage, author: author ?? 'local' })
    updatedLog.lastCheckout = { commitId, timestamp }
    saveProjectLog(projectName, updatedLog)

    return { success: true, branch: newBranch, from: fromCommit, commitId }
  } else {
    const projectPath = getProjectPath(projectName)
    if (!projectPath || projectPath === '/' || projectPath === 'NA') {
      throw new Error(`Project path not found for '${projectName}'. Please set the project path in settings.`)
    }

    const files = await getAllFiles(projectPath)
    const fileMap: FileMapEntry[] = []
    for (const [rel, full] of Object.entries(files)) {
      const hash = full !== 'empty' ? storeInCasSync(full, casDir) : 'empty'
      fileMap.push({ path: rel, hash })
    }

    const commitMessage = `Created branch ${newBranch}`
    saveCommit(projectName, commitId, fileMap, commitsDir)

    const updatedLog = loadLocalProjectLog(projectName)
    if (!updatedLog) throw new Error('project log not found')
    addCommitToLog(updatedLog, newBranch, { commit_id: commitId, timestamp, message: commitMessage, author: author ?? 'local' })
    updatedLog.lastCheckout = { commitId, timestamp }
    saveProjectLog(projectName, updatedLog)

    return { success: true, branch: newBranch, commitId }
  }
}

export async function switchBranch(projectName: string, branchName: string, projectId?: string) {
  const log = loadLocalProjectLog(projectName, projectId)
  if (!log) throw new Error('project log not found')
  if (!log.branches?.find((b: any) => b.name === branchName)) {
    throw new Error(`Branch '${branchName}' does not exist.`)
  }
  log.current_branch = branchName
  saveProjectLog(projectName, log)
  return { success: true, branch: branchName, log }
}

export async function getProjectLog(projectName: string, projectId?: string) {
  return loadProjectLog(projectName, projectId)
}

// Backward-compat alias
export const createBranchLocal = createBranch
