import fs from "fs";
import path from "path";
import { writeJsonSync } from "./fs-utils";
import { loadRegistry } from './registry'

import { getLogsDir } from "./constants";

// ============================================================================
// LOCAL LOG FILE PATHS
// ============================================================================

function getLogFilePath(projectName: string, projectId?: string): {
  newPath: string | null;
  legacyPath: string;
  usePath: string;
  needsMigration: boolean;
} {
  const logsDir = getLogsDir();
  const legacyPath = path.join(logsDir, `${projectName}.json`);

  if (projectId) {
    const newPath = path.join(logsDir, `${projectId}-${projectName}.json`);
    const legacyExists = fs.existsSync(legacyPath);
    const newExists = fs.existsSync(newPath);
    if (legacyExists && !newExists) {
      return { newPath, legacyPath, usePath: legacyPath, needsMigration: true };
    }
    return { newPath, legacyPath, usePath: newPath, needsMigration: false };
  }

  return { newPath: null, legacyPath, usePath: legacyPath, needsMigration: false };
}

function migrateLogFile(projectName: string, projectId: string): void {
  const logsDir = getLogsDir();
  const legacyPath = path.join(logsDir, `${projectName}.json`);
  const newPath = path.join(logsDir, `${projectId}-${projectName}.json`);
  if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
    fs.renameSync(legacyPath, newPath);
  }
}

// ============================================================================
// LOCAL LOG — read/write from disk
// ============================================================================

// Backfills fields introduced after a project's log was first written, so
// older projects behave the same as new ones (and so generic field updates
// like updateLogField, which require the key to already exist, work on them).
function withLogDefaults(log: any): any {
  if (log.primaryFile === undefined) log.primaryFile = null;
  if (log.ignoredFiles === undefined) log.ignoredFiles = [];
  return log;
}

export function loadLocalProjectLog(projectName: string, projectId?: string): any {
  let effectiveId = projectId;

  if (!effectiveId) {
    try {
      const logsDir = getLogsDir();
      const userDir = path.dirname(logsDir);
      const registryFile = path.join(userDir, 'registry.json');
      if (fs.existsSync(registryFile)) {
        const registryData = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
        const projects = registryData.projects || {};
        if (projects[projectName]) effectiveId = projects[projectName].project_id;
      }
    } catch (err) {
      console.error('[loadLocalProjectLog] Failed to lookup ID in registry:', err);
    }
  }

  const fileInfo = getLogFilePath(projectName, effectiveId);
  if (fileInfo.newPath && fs.existsSync(fileInfo.newPath)) {
    return withLogDefaults(JSON.parse(fs.readFileSync(fileInfo.newPath, "utf8")));
  }
  if (fs.existsSync(fileInfo.legacyPath)) {
    return withLogDefaults(JSON.parse(fs.readFileSync(fileInfo.legacyPath, "utf8")));
  }
  return null;
}

export async function loadProjectLog(projectName: string, projectId?: string): Promise<any> {
  const fileInfo = getLogFilePath(projectName, projectId);

  // Local log exists — return it
  if (fs.existsSync(fileInfo.usePath)) {
    const localLog = withLogDefaults(JSON.parse(fs.readFileSync(fileInfo.usePath, "utf8")));
    if (fileInfo.needsMigration && projectId) migrateLogFile(projectName, projectId);
    return localLog;
  }

  // Resolve ID from registry if not supplied
  if (!projectId) {
    const registry = loadRegistry();
    if (registry[projectName]) return loadProjectLog(projectName, registry[projectName].project_id);
    return {};
  }

  return {};
}

export function deleteProjectLog(projectName: string, projectId?: string) {
  const fileInfo = getLogFilePath(projectName, projectId);
  if (fileInfo.newPath && fs.existsSync(fileInfo.newPath)) fs.unlinkSync(fileInfo.newPath);
  if (fs.existsSync(fileInfo.legacyPath)) fs.unlinkSync(fileInfo.legacyPath);
}

export function saveProjectLog(projectName: string, log: any) {
  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const projectId = log.id;
  const fileInfo = getLogFilePath(projectName, projectId);
  const targetPath = fileInfo.newPath || fileInfo.legacyPath;
  writeJsonSync(targetPath, log);
  if (fileInfo.newPath && fs.existsSync(fileInfo.legacyPath)) fs.unlinkSync(fileInfo.legacyPath);
}

export function buildProjectLog(projectName: string, _projectPath: string, opts: any) {
  return {
    id: opts.projectID,
    name: projectName,
    daw: opts.daw,
    privacy_flag: opts.privacy_flag ?? "local",
    collaborators: opts.collaborators || [],
    description: opts.description || null,
    bpm: opts.bpm || null,
    key: opts.key || null,
    current_branch: "main",
    branches: [{ name: "main", commits: [] }],
    lastCheckout: null as { commitId: string; timestamp: string } | null,
    owner_id: opts.owner_id || opts.uid || null,
    // Which file inside the project folder is "the" tracked DAW project,
    // and which candidate files the user has chosen to exclude from that
    // decision (e.g. a sketch or a second DAW's file left in the same folder).
    primaryFile: opts.primaryFile || null,
    ignoredFiles: opts.ignoredFiles || [],
  };
}

export function addCommitToLog(
  log: any,
  branch_name: string,
  commitData: { commit_id: string; timestamp: string; message: string; author: string; preview_file?: string },
) {
  const branch = log.branches.find((b: any) => b.name === branch_name);
  if (!branch) {
    log.branches.push({ name: branch_name, commits: [commitData] });
  } else {
    branch.commits.push(commitData);
  }
  return log;
}

export async function updateLogField(projectName: string, field: string, value: any): Promise<any> {
  const log = await loadProjectLog(projectName);
  if (!log || !log.project_name) throw new Error(`Project "${projectName}" not found`);
  log[field] = value;
  saveProjectLog(projectName, log);
  return log;
}
