import fs from 'fs';
import path from 'path';
import { getUserDir } from './constants';
import { writeJsonSync } from './fs-utils';

// ============================================
// Types
// ============================================

export interface Folder {
  id: string;
  name: string;
  position: number;
  parentId: string | null;
  expanded?: boolean;
}

export interface UserConfigData {
  folders: Folder[];
  projectFolderMap: Record<string | number, string | null>;
  warningPreferences?: Record<string, boolean>; // Key: warning type, Value: don't show again
  casStorageLimit?: number | null; // CAS storage limit in bytes, null = unlimited
  casDirectory?: string; // Future: custom CAS directory path
  defaultStorageMode?: 'home' | 'project'; // Default storage location for newly created projects
}

// ============================================
// UserConfigManager Class - Manages All User Preferences
// ============================================

export class UserConfigManager {
  private username: string;
  private filePath: string;
  private data: UserConfigData;

  constructor(username: string) {
    this.username = username;
    this.filePath = path.join(getUserDir(username), 'config.json');
    this.data = this.load();
  }

  // ---- Private Methods ----

  private load(): UserConfigData {
    if (!fs.existsSync(this.filePath)) {
      return { folders: [], projectFolderMap: {} };
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        folders: raw.folders || [],
        projectFolderMap: raw.projectFolderMap || {},
        warningPreferences: raw.warningPreferences || {},
        casStorageLimit: raw.casStorageLimit || null,
        casDirectory: raw.casDirectory || undefined,
        defaultStorageMode: raw.defaultStorageMode || undefined,
      };
    } catch (err) {
      console.error('[UserConfigManager] Error loading config:', err);
      return { folders: [], projectFolderMap: {}, warningPreferences: {} };
    }
  }

  private save(): void {
    const userDir = getUserDir(this.username);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    writeJsonSync(this.filePath, this.data);
  }

  // ---- Folder Operations ----

  /** Get all folders */
  getFolders(): Folder[] {
    return this.data.folders;
  }

  /** Create a new folder */
  createFolder(name: string, parentId: string | null = null): Folder {
    const folder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      position: this.data.folders.length,
      parentId,
    };
    this.data.folders.push(folder);
    this.save();
    return folder;
  }

  /** Rename a folder */
  renameFolder(folderId: string, newName: string): boolean {
    const folder = this.data.folders.find(f => f.id === folderId);
    if (!folder) return false;
    folder.name = newName;
    this.save();
    return true;
  }

  /** Delete a folder (does not delete nested projects, moves them to root) */
  deleteFolder(folderId: string): boolean {
    const index = this.data.folders.findIndex(f => f.id === folderId);
    if (index === -1) return false;

    // Move all projects in this folder to root
    Object.keys(this.data.projectFolderMap).forEach(projectId => {
      if (this.data.projectFolderMap[projectId] === folderId) {
        this.data.projectFolderMap[projectId] = null;
      }
    });

    // Move nested folders to parent
    const deletedFolder = this.data.folders[index];
    this.data.folders.forEach(f => {
      if (f.parentId === folderId) {
        f.parentId = deletedFolder.parentId;
      }
    });

    this.data.folders.splice(index, 1);
    this.save();
    return true;
  }

  /** Move a folder to a new parent */
  moveFolder(folderId: string, newParentId: string | null): boolean {
    const folder = this.data.folders.find(f => f.id === folderId);
    if (!folder) return false;
    
    // Prevent moving folder into itself or its descendants
    if (newParentId && this.isDescendant(newParentId, folderId)) {
      return false;
    }
    
    folder.parentId = newParentId;
    this.save();
    return true;
  }

  /** Check if a folder is a descendant of another */
  private isDescendant(potentialDescendantId: string, ancestorId: string): boolean {
    let current = this.data.folders.find(f => f.id === potentialDescendantId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = this.data.folders.find(f => f.id === current!.parentId);
    }
    return false;
  }

  /** Update folder positions (for reordering) */
  updateFolderPositions(folderIds: string[]): void {
    folderIds.forEach((id, index) => {
      const folder = this.data.folders.find(f => f.id === id);
      if (folder) folder.position = index;
    });
    this.save();
  }

  // ---- Project-Folder Assignment Operations ----

  /** Get the folder assignment for a project */
  getProjectFolder(projectId: string | number): string | null {
    return this.data.projectFolderMap[projectId] ?? null;
  }

  /** Get all project-folder mappings */
  getProjectFolderMap(): Record<string | number, string | null> {
    return { ...this.data.projectFolderMap };
  }

  /** Move a project to a folder (or root if folderId is null) */
  moveProject(projectId: string | number, folderId: string | null): void {
    this.data.projectFolderMap[projectId] = folderId;
    this.save();
  }

  /** Remove a project from folder tracking (e.g., when project is deleted) */
  removeProject(projectId: string | number): void {
    delete this.data.projectFolderMap[projectId];
    this.save();
  }

  /** Get all projects in a specific folder */
  getProjectsInFolder(folderId: string | null): (string | number)[] {
    return Object.entries(this.data.projectFolderMap)
      .filter(([_, folder]) => folder === folderId)
      .map(([projectId]) => isNaN(Number(projectId)) ? projectId : Number(projectId));
  }

  // ---- Bulk Operations ----

  /** Replace all folders (used for full sync from UI) */
  setFolders(folders: Folder[]): void {
    this.data.folders = folders;
    this.save();
  }

  /** Replace all project-folder mappings */
  setProjectFolderMap(map: Record<string | number, string | null>): void {
    this.data.projectFolderMap = map;
    this.save();
  }

  /** Reload data from file (useful if external changes occurred) */
  reload(): void {
    this.data = this.load();
  }

  // ---- Warning Preferences Operations ----

  /** Check if a warning should be skipped */
  shouldSkipWarning(warningType: string): boolean {
    return this.data.warningPreferences?.[warningType] === true;
  }

  /** Set warning preference (don't show again) */
  setWarningPreference(warningType: string, skipWarning: boolean): void {
    if (!this.data.warningPreferences) {
      this.data.warningPreferences = {};
    }
    this.data.warningPreferences[warningType] = skipWarning;
    this.save();
  }

  /** Reset a specific warning preference */
  resetWarningPreference(warningType: string): void {
    if (this.data.warningPreferences) {
      delete this.data.warningPreferences[warningType];
      this.save();
    }
  }

  /** Reset all warning preferences */
  resetAllWarningPreferences(): void {
    this.data.warningPreferences = {};
    this.save();
  }

  /** Get all warning preferences */
  getWarningPreferences(): Record<string, boolean> {
    return { ...(this.data.warningPreferences || {}) };
  }

  // ---- CAS Storage Management ----

  /** Get CAS storage limit in bytes (null = unlimited) */
  getCasStorageLimit(): number | null {
    return this.data.casStorageLimit ?? null;
  }

  /** Set CAS storage limit in bytes (null = unlimited) */
  setCasStorageLimit(limitBytes: number | null): void {
    this.data.casStorageLimit = limitBytes;
    this.save();
  }

  /** Get custom CAS directory path (for future use) */
  getCasDirectory(): string | undefined {
    return this.data.casDirectory;
  }

  /** Set custom CAS directory path (for future use) */
  setCasDirectory(directoryPath: string): void {
    this.data.casDirectory = directoryPath;
    this.save();
  }

  /** Get the default storage mode for newly created projects */
  getDefaultStorageMode(): 'home' | 'project' {
    return this.data.defaultStorageMode ?? 'home';
  }

  /** Set the default storage mode for newly created projects */
  setDefaultStorageMode(mode: 'home' | 'project'): void {
    this.data.defaultStorageMode = mode;
    this.save();
  }
}

// ============================================
// Factory Function (for convenience)
// ============================================

let cachedManager: UserConfigManager | null = null;
let cachedUsername: string | null = null;

/** Get a UserConfigManager instance for the given username */
export function getUserConfigManager(username: string): UserConfigManager {
  if (cachedManager && cachedUsername === username) {
    return cachedManager;
  }
  cachedManager = new UserConfigManager(username);
  cachedUsername = username;
  return cachedManager;
}

/** Clear the cached manager (call on logout) */
export function clearUserConfigCache(): void {
  cachedManager = null;
  cachedUsername = null;
}
