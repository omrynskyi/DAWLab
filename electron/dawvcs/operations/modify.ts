import { saveProjectLog, loadProjectLog } from '../core/log'
import { loadRegistry, saveRegistry, getProjectPath } from '../core/registry'
import { ProjectInfo } from '../types'
import path from 'path'

export async function updateProjectLog(
  projectName: string,
  updates: Record<string, any>
): Promise<any> {
  const log = await loadProjectLog(projectName)
  if (!log || Object.keys(log).length === 0) {
    throw new Error(`Project log for "${projectName}" not found`)
  }

  const protectedFields = ['project_id', 'branches', 'project_path']
  for (const [key, value] of Object.entries(updates)) {
    if (protectedFields.includes(key)) {
      throw new Error(`Cannot directly update protected field: ${key}`)
    }
    if (!(key in log)) {
      throw new Error(`Field "${key}" does not exist in project log`)
    }
    log[key] = value
  }

  saveProjectLog(projectName, log)
  return log
}

export async function updateProjectInRegistry(
  projectName: string,
  updates: Record<string, any>
) {
  const projects = loadRegistry()

  const validKeys: (keyof ProjectInfo)[] = [
    'project_id', 'name', 'path', 'daw', 'genre',
    'description', 'key', 'bpm', 'privacy_flag', 'tags'
  ]
  const filteredUpdates: Partial<Record<keyof ProjectInfo, any>> = {}
  for (const key of Object.keys(updates)) {
    if (validKeys.includes(key as keyof ProjectInfo)) {
      filteredUpdates[key as keyof ProjectInfo] = updates[key]
    }
  }

  const ignoredKeys = Object.keys(updates).filter(k => !validKeys.includes(k as keyof ProjectInfo))
  if (ignoredKeys.length > 0) console.warn(`Ignored unknown fields for "${projectName}":`, ignoredKeys)

  if (!projects[projectName]) throw new Error(`Project "${projectName}" not found in registry`)

  const protectedFields = ['id', 'name', 'project_id']
  for (const [key, value] of Object.entries(filteredUpdates)) {
    if (protectedFields.includes(key)) { console.warn(`Skipping protected field "${key}"`); continue }
    projects[projectName][key] = key === 'path' && value ? path.resolve(value) : value
  }
  saveRegistry(projects)
}

export async function modifyProjectDetails(
  projectId: string,
  details: {
    genre?: string
    daw?: string
    description?: string
    bpm?: number
    key?: string
    public?: boolean
  }
) {
  const projects = loadRegistry()
  const localProject = Object.entries(projects).find(([_, p]: [string, any]) => p.project_id === projectId)

  if (localProject) {
    const [projectName, projectData] = localProject as [string, Record<string, any>]
    const updatedProject: Record<string, any> = { ...projectData }

    if (details.genre !== undefined) updatedProject.genre = details.genre
    if (details.description !== undefined) updatedProject.description = details.description
    if (details.bpm !== undefined) updatedProject.bpm = details.bpm
    if (details.key !== undefined) updatedProject.key = details.key
    if (details.public !== undefined) updatedProject.privacy_flag = details.public ? 'public' : 'private'

    projects[projectName] = updatedProject
    saveRegistry(projects)

    return { success: true, updated: Object.keys(details) }
  }

  return null
}

export async function getProjectDetails(projectId: string) {
  const projects = loadRegistry()
  const localProject = Object.entries(projects).find(([_, p]: [string, any]) => p.project_id === projectId)

  if (localProject) {
    const [projectName, projectData] = localProject as [string, any]
    const projectPath = getProjectPath(projectName)
    const log = await loadProjectLog(projectName, projectData.project_id)
    return {
      genre: projectData.genre || '',
      daw: projectData.daw || '',
      description: log?.description ?? projectData.description ?? '',
      bpm: log?.bpm ?? projectData.bpm ?? null,
      key: log?.key ?? projectData.key ?? null,
      privacy_flag: log?.privacy_flag ?? projectData.privacy_flag ?? 'local',
      owner_id: log?.owner_id ?? null,
      access_source: 'owned',
      project_path: projectPath || 'NA',
      tags: log?.tags ?? projectData.tags ?? [],
    }
  }

  return null
}
