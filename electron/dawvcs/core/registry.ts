import fs from "fs";
import path from "path";
import { writeJsonSync } from "./fs-utils";
import { saveProjectLog } from "./log";

import { getRegistryFile, getUserDir } from "./constants";

export function loadRegistry() {
  const registryFile = getRegistryFile();
  if (!fs.existsSync(registryFile)) {
    return {};
  }
  try {
    const data = JSON.parse(fs.readFileSync(registryFile, "utf8"));
    return data.projects || {};
  } catch (err) {
    console.error('[registry.ts loadRegistry] Failed to parse registry, returning empty:', err)
    return {}
  }
}

export function saveRegistry(projects: Record<string, any>) {
  const registryFile = getRegistryFile();
  const userDir = getUserDir();
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  writeJsonSync(registryFile, { projects });
}

export function registerProject(
  project_id: string,
  name: string,
  projectPath: string,
  daw: string,
  genre?: string,
  description?: string,
  key?: string,
  bpm?: number,
  privacy_flag?: string, tags?: string[],
  storage_mode?: string,
) {
  const projects = loadRegistry();
  projects[name] = {
    project_id,
    name,
    // Don't resolve "NA" placeholder - keep it as-is
    path: projectPath === "NA" ? "NA" : path.resolve(projectPath),
    daw,
    ...(genre !== undefined && { genre }),
    ...(description !== undefined && { description }),
    ...(key !== undefined && { key }),
    ...(bpm !== undefined && { bpm }),
    ...(privacy_flag !== undefined && { privacy_flag }),
    ...(tags !== undefined && { tags }),
    ...(storage_mode !== undefined && { storage_mode }),
  };
  saveRegistry(projects);
}

export function getAllProjects(): ProjectInfo[] {
  const projects = loadRegistry();
  return Object.values(projects);
}

export function unregisterProject(name: string) {
  const projects = loadRegistry();
  delete projects[name];
  saveRegistry(projects);
}

/**
 * Get the project path from the registry.
 * @param projectName The name of the project
 * @returns The project path or null if not found
 */
export function getProjectPath(projectName: string): string | null {
  const projects = loadRegistry();
  if (projects[projectName]) {
    return projects[projectName].path || null;
  }
  return null;
}

/**
 * Migrate project_path from old log format to registry
 * This is for backward compatibility with logs that have project_path field
 * @param log - The project log (may contain old project_path field)
 */
export async function migrateProjectPathToRegistry(log: any): Promise<void> {
  // Only migrate if log has project_path
  if (!log.project_path || log.project_path === '/') {
    return;
  }

  const projectName = log.name || log.project_name; // Support both old and new field names
  const projectPath = log.project_path;

  // If not in registry, add it
  const existingPath = getProjectPath(projectName);
  if (!existingPath || existingPath === '/') {
    const registry = loadRegistry();
    if (registry[projectName]) {
      registry[projectName].path = projectPath;
      saveRegistry(registry);
    }
  }

  // Remove project_path from log and save
  delete log.project_path;
  await saveProjectLog(projectName, log);
}
