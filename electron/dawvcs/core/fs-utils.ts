import fs from 'fs'
import path from 'path'
import { promises as fsp } from 'fs'
import { shell } from 'electron';

// Directories that are DAWLab's own bookkeeping, never the user's project
// content. Must never be walked/tracked, regardless of ignoredPaths - this
// isn't a user choice, it's how "project" storage mode keeps history inside
// the project folder without recursively versioning its own prior versions.
const ALWAYS_SKIPPED_DIR_NAMES = new Set(['.dawlabproject', '.dawlab'])

export async function getAllFiles(root: string, ignoredPaths: string[] = []) {
  const files: Record<string, string> = {}
  const ignoredSet = new Set(ignoredPaths)

  function isIgnored(relPath: string): boolean {
    if (ignoredSet.has(relPath)) return true
    for (const ignored of ignoredSet) {
      if (relPath.startsWith(`${ignored}/`)) return true
    }
    return false
  }

  async function walk(dir: string) {
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      if (entries.length === 0) {
        files[path.relative(root, dir).split(path.sep).join('/')] = "empty"
        return
      }
      for (const e of entries) {
        // Skip directories named "Backup" and DAWLab's own storage folders
        if (e.isDirectory() && (e.name === 'Backup' || e.name === 'Project File Backups' || ALWAYS_SKIPPED_DIR_NAMES.has(e.name))) {
          continue
        }

        const full = path.join(dir, e.name)
        const relPath = path.relative(root, full).split(path.sep).join('/')
        if (isIgnored(relPath)) continue

        // Check if this is a symlink and if it points outside the project
        if (e.isSymbolicLink()) {
          try {
            const realPath = fs.realpathSync(full)
            // Skip symlinks that point outside the project root
            if (!realPath.startsWith(fs.realpathSync(root))) {
              console.warn(`[getAllFiles] Skipping symlink outside project: ${full} -> ${realPath}`)
              continue
            }
          } catch (symlinkErr) {
            console.warn(`[getAllFiles] Skipping broken symlink: ${full}`)
            continue
          }
        }

        if (e.isDirectory()) await walk(full)
        else files[relPath] = full
      }
    } catch (err: any) {
      // Skip directories we don't have permission to access
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        console.warn(`[getAllFiles] Skipping directory due to permissions: ${dir}`)
        return
      }
      // Re-throw other errors
      throw err
    }
  }

  await walk(root)
  return files
}

export function writeJsonSync(target: string, data: any) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  
  // Atomic write: write to temp file then rename
  // This prevents race conditions when multiple processes write to the same file
  const tempFile = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tempFile, target)
  } catch (err) {
    // Clean up temp file if rename fails
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile) } catch { /* ignore cleanup errors */ }
    }
    throw err
  }
}


export async function openProject(projectPath: string) {
  console.log('Opening project:', projectPath);
  try {
    // Check if path exists
    if (!fs.existsSync(projectPath)) {
      console.error('Project path does not exist:', projectPath);
      return { success: false, error: 'Path not found' };
    }

    let fileToOpen = projectPath;

    // Check if it's a directory (like Logic Pro X packages)
    const stats = fs.statSync(projectPath);

    if (stats.isDirectory()) {
      // Look for project files inside the directory
      const files = fs.readdirSync(projectPath);

      // Priority order: .logicx, .als, .flp, .rpp, .ptx
      const projectFile = files.find(file => {
        const ext = path.extname(file).toLowerCase();
        return ext === '.logicx' || ext === '.als' || ext === '.flp' || ext === '.rpp' || ext === '.ptx';
      });

      if (projectFile) {
        fileToOpen = path.join(projectPath, projectFile);
      } else {
        // If no project file found, recursively search subdirectories
        const foundFile = findProjectFileRecursive(projectPath);
        if (foundFile) {
          fileToOpen = foundFile;
        } else {
          console.error('No project file found in directory');
          return { success: false, error: 'No project file found' };
        }
      }
    }

    console.log('Opening project file:', fileToOpen);

    // Open the project file with default application (returns Promise<string>)
    const errorMsg = await shell.openPath(fileToOpen);

    if (errorMsg) {
      console.error('Error opening project:', errorMsg);
      return { success: false, error: errorMsg };
    }

    return { success: true };

  } catch (error) {
    console.error('Error opening project:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Helper function to recursively search for project files
function findProjectFileRecursive(dir: string, maxDepth: number = 3, currentDepth: number = 0): string | null {
  if (currentDepth >= maxDepth) return null;

  try {
    const files = fs.readdirSync(dir);

    // First, look in current directory
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.logicx' || ext === '.als' || ext === '.flp' || ext === '.rpp' || ext === '.ptx') {
        return path.join(dir, file);
      }
    }

    // Then search subdirectories
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        const found = findProjectFileRecursive(fullPath, maxDepth, currentDepth + 1);
        if (found) return found;
      }
    }
  } catch (error) {
    console.error('Error searching directory:', error);
  }

  return null;
}

/**
 * Helper to recursively find the latest modification time of any file in a directory.
 * Skips specific folders that are not relevant for user-initiated changes.
 */
async function getLatestModTimeRecursive(rootPath: string): Promise<{ latestModTime: number; latestFilePath: string }> {
  let latestModTime = 0;
  let latestFilePath = rootPath;

  async function scan(dir: string) {
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.name;
        // Skip metadata/backup folders and system files that shouldn't trigger "modified" state
        if (
          name === 'Backup' ||
          name === 'Project File Backups' ||
          name === '.dawlab' ||
          name === '.dawlabproject' ||
          name === '.DS_Store' ||
          name === 'desktop.ini'
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        // Skip symlinks pointing outside project to avoid infinite loops or external scans
        if (entry.isSymbolicLink()) {
          try {
            const realPath = fs.realpathSync(fullPath);
            const rootRealPath = fs.realpathSync(rootPath);
            if (!realPath.startsWith(rootRealPath)) continue;
          } catch {
            continue;
          }
        }

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          try {
            const stats = await fsp.stat(fullPath);
            if (stats.mtimeMs > latestModTime) {
              latestModTime = stats.mtimeMs;
              latestFilePath = fullPath;
            }
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch (err: any) {
      if (err.code !== 'EACCES' && err.code !== 'EPERM') {
        console.warn(`[getLatestModTimeRecursive] Error scanning: ${dir}`, err.message);
      }
    }
  }

  await scan(rootPath);

  // Fallback to root directory time if no internal files found
  if (latestModTime === 0) {
    try {
      const stats = await fsp.stat(rootPath);
      latestModTime = stats.mtimeMs;
    } catch {
      // ignore
    }
  }

  return { latestModTime, latestFilePath };
}

/**
 * Check if any files in the project directory were modified within the last N minutes
 */
export async function checkProjectModified(projectPath: string, withinMinutes: number = 5): Promise<{
  modified: boolean;
  latestModTime?: string;
}> {
  try {
    if (!fs.existsSync(projectPath)) {
      return { modified: false };
    }

    const { latestModTime } = await getLatestModTimeRecursive(projectPath);
    const now = Date.now();
    const threshold = now - (withinMinutes * 60 * 1000);

    if (latestModTime > threshold) {
      return {
        modified: true,
        latestModTime: new Date(latestModTime).toISOString()
      };
    }
    return { modified: false };
  } catch (error) {
    console.error('[checkProjectModified] Error:', error);
    return { modified: false };
  }
}

/**
 * Get the latest file modification time from a project directory
 * Returns the timestamp without any threshold comparison - useful for
 * comparing against commit timestamps to detect unsaved changes.
 */
export async function getProjectLastSaveTime(projectPath: string): Promise<{
  success: boolean;
  latestModTime?: number;      // Unix timestamp in milliseconds
  latestModTimeISO?: string;   // ISO format string
  latestFilePath?: string;     // Path used
}> {
  try {
    if (!fs.existsSync(projectPath)) {
      return { success: false };
    }

    const { latestModTime, latestFilePath } = await getLatestModTimeRecursive(projectPath);

    console.log(`[getProjectLastSaveTime] Latest mod time: ${new Date(latestModTime).toISOString()} (File: ${latestFilePath})`);

    return {
      success: true,
      latestModTime: latestModTime,
      latestModTimeISO: new Date(latestModTime).toISOString(),
      latestFilePath: latestFilePath
    };
  } catch (error) {
    console.error('[getProjectLastSaveTime] Error:', error);
    return { success: false };
  }
}

/**
 * Recursively delete a directory and all its contents
 */
export function deleteDirectoryRecursive(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteDirectoryRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}