import fs from 'fs'
import path from 'path'
import { unregisterProject, getProjectPath } from '../core/registry'
import { getProjectHashes, getHashesInUseByOtherProjects, deleteOrphanedHashes } from '../core/cas'
import { loadProjectLog, deleteProjectLog } from '../core/log'
import { deleteProjectCommits } from '../core/commits'
import { getProjectStorageDirs } from '../core/storage-location'

export async function deleteProject(projectName: string) {
  const log = await loadProjectLog(projectName)
  const { casDir, commitsDir, mode } = getProjectStorageDirs(projectName)

  let deletedHashCount = 0
  if (mode === 'project') {
    // Project-local CAS is never shared with other projects, so there is no
    // cross-project hash usage to check — just drop the whole storage folder.
    deleteProjectCommits(projectName, commitsDir)
    const projectPath = getProjectPath(projectName)
    if (projectPath && projectPath !== 'NA') {
      fs.rmSync(path.join(projectPath, '.dawlabproject'), { recursive: true, force: true })
    }
  } else {
    const projectHashes = getProjectHashes(projectName, commitsDir)
    const hashesInUse = getHashesInUseByOtherProjects(projectName, commitsDir)
    deletedHashCount = deleteOrphanedHashes(projectHashes, hashesInUse, casDir)
    deleteProjectCommits(projectName, commitsDir)
  }

  deleteProjectLog(projectName, log?.id ? String(log.id) : undefined)
  unregisterProject(projectName)

  return {
    success: true,
    message: `Project "${projectName}" deleted successfully`,
    deletedHashes: deletedHashCount
  }
}

// Backward-compat alias
export const deleteProjectLocal = deleteProject
