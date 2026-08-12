import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  net,
} from "electron";
import {
  initProject,
  commitProject,
  rollbackProject,
  createBranch,
  switchBranch,
  getAllProjects,
  getProjectLog,
  deleteProject,
  updateProjectLog,
  updateProjectInRegistry,
  openProject,
  checkProjectModified,
  getProjectLastSaveTime,
  modifyProjectDetails,
  getProjectDetails,
  loadLocalProjectLog,
  clearUsername,
  persistUsername,
  initializeUsername,
  getUserConfigManager,
  clearUserConfigCache,
  loadRegistry,
  addPreviewToCommit,
  previewProject,
  cleanupPreview,
  getProjectFacets,
} from "./dawvcs/index";
import {
  getUsername,
  VCS_DIR,
  getRegistryFile,
  getUserMediaDir,
  HOME,
  getSuggestedUsername,
  hasCompletedOnboarding,
  listUsers,
  listUsersWithCounts,
  deleteUser,
  clearPersistedUser,
} from "./dawvcs/core/constants";
import type { AudioItem } from "./dawvcs/core/config";
import { getCasPath, calculateCasSize } from "./dawvcs/core/cas";
import { getProjectPath } from "./dawvcs/core/registry";
import { saveProjectLog } from "./dawvcs/core/log";
import { getCommitPath, getCommitFileMap } from "./dawvcs/core/commits";
import { getProjectStorageDirs } from "./dawvcs/core/storage-location";
import { detectDAW, getProjectFileCandidates } from "./dawvcs/core/daw-detection";
import { getCleanableFiles, cleanCasFiles } from "./dawvcs/operations/clean";
import { scanForProjects, getDefaultScanRoots } from "./dawvcs/operations/scan";
import { getInstalledPlugins, rescanPlugins } from "./workers/pluginScanner";
import { startDraftWatch, stopDraftWatch, stopAllDraftWatches } from "./watchers/draftWatcher";
import { fileURLToPath } from "node:url";

import path from "node:path";
import fs from "node:fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Audio file extensions accepted for Library audio items (bounces / references).
// Lowercase, with leading dot — matched against path.extname().toLowerCase().
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".aif", ".aiff", ".flac", ".m4a", ".ogg"];

// Register custom protocol as privileged for audio streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: "dawpreview",
    privileges: {
      stream: true,
      bypassCSP: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

function tryGetUsername(): string | null {
  try {
    return getUsername();
  } catch {
    return null;
  }
}

// Deep link protocol name
const PROTOCOL = "dawlab";

// Register custom protocol for deep linking (OAuth callbacks)
if (process.defaultApp) {
  // Development: need to pass path to app
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  // Production
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Handle deep link on macOS
app.on("open-url", (event, url) => {
  event.preventDefault();
  // console.log('[main.ts] Deep link received (macOS):', url);
  handleDeepLink(url);
});

// Handle deep link on Windows (single instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Check for deep link on startup (Windows/Linux)
  // This handles the case where the app is launched via the protocol link
  if (process.platform === "win32" || process.platform === "linux") {
    const url = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      console.log("[main.ts] Deep link received (Startup):", url);
      // We need to defer this slightly to ensure handleDeepLink is defined if it relies on hoisting,
      // but in JS function declarations are hoisted.
      // However, we need to ensure the app is ready for some things, but handleDeepLink stores pendingAuth if not.
      handleDeepLink(url);
    }
  }

  app.on("second-instance", (_event, commandLine) => {
    // Windows: the deep link URL will be in commandLine
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      console.log("[main.ts] Deep link received (Windows):", url);
      handleDeepLink(url);
    }
    // Focus the window if it exists
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// Parse deep link URL and send to renderer
function handleDeepLink(url: string) {
  try {
    console.log("[main.ts] Processing deep link:", url);

    // Handle project open link: dawlab://open/project?name=xxx&id=xxx&commit=xxx
    if (url.includes("open/project")) {
      const queryIndex = url.indexOf("?");
      if (queryIndex !== -1) {
        const params = new URLSearchParams(url.substring(queryIndex + 1));
        const projectName = params.get("name");
        const projectId = params.get("id");
        const commitId = params.get("commit");

        if (projectName && projectId) {
          console.log("[main.ts] Sending open-project to renderer:", {
            projectName,
            projectId,
            commitId,
          });
          if (win) {
            win.webContents.send("open-project", {
              projectName,
              projectId,
              commitId,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("[main.ts] Error parsing deep link URL:", error);
  }
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(__dirname, "..", "src", "assets", "icons", "logo.icns"),
    minWidth: 450,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      devTools: !app.isPackaged,
    },
  });

  win.maximize();

  // Prevent the Electron window from navigating away to external https:// URLs.
  // Any link/redirect to a non-app origin opens in the system browser instead.
  win.webContents.on("will-navigate", (event, url) => {
    const appOrigin = VITE_DEV_SERVER_URL || `file://`;
    if (!url.startsWith(appOrigin) && !url.startsWith("file://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

// Tear down any active file watchers before the app exits.
app.on("before-quit", () => {
  stopAllDraftWatches();
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  // Load the persisted username into memory if one exists. On genuine first
  // run this returns null (no user yet) and the renderer shows onboarding.
  try {
    initializeUsername();
  } catch (err) {
    console.warn("[main.ts] Failed to initialize username:", err);
  }

  // Register dawpreview protocol for audio previews
  protocol.handle("dawpreview", async (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname);

    // Correctly format the file path
    const normalizedPath =
      process.platform === "win32" && filePath.startsWith("/")
        ? filePath.substring(1)
        : filePath;

    const fileUrl = "file://" + normalizedPath;

    try {
      // Get file size for Content-Length
      const stats = fs.statSync(normalizedPath);
      const fileSize = stats.size;
      const response = await net.fetch(fileUrl);
      const extension = path.extname(normalizedPath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".aif": "audio/x-aiff",
        ".aiff": "audio/x-aiff",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
      };

      const mimeType = mimeTypes[extension] || "audio/mpeg";

      const headers = new Headers(response.headers);
      headers.set("Content-Type", mimeType);
      headers.set("Content-Length", fileSize.toString());
      headers.set("Accept-Ranges", "bytes");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error("[Protocol] Error:", error);
      return net.fetch(fileUrl);
    }
  });

  // Pre-scan plugins in the background so cache is warm
  try {
    getInstalledPlugins();
  } catch (err) {
    console.warn("[main.ts] Plugin pre-scan failed:", err);
  }

  createWindow();
});

// file dialogs
ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle("pick-files", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Text Files", extensions: ["txt"] },
      {
        name: "Audio Files",
        extensions: ["wav", "mp3", "aiff", "flac", "m4a"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return result.filePaths;
});

// Audio-only file picker for importing bounces / references into the Library.
ipcMain.handle("pick-audio-files", async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Audio Files",
        extensions: AUDIO_EXTENSIONS.map((e) => e.replace(/^\./, "")),
      },
    ],
  });
  return result.filePaths;
});

ipcMain.handle("set-username", (_ev, username: string) => {
  persistUsername(username);
  return { success: true };
});

ipcMain.handle("get-username", () => {
  return tryGetUsername();
});

ipcMain.handle("clear-username", () => {
  clearUsername();
  return { success: true };
});

// Onboarding / users
ipcMain.handle("get-suggested-username", () => {
  return getSuggestedUsername();
});

ipcMain.handle("has-completed-onboarding", () => {
  return hasCompletedOnboarding();
});

ipcMain.handle("list-users", () => {
  return listUsers();
});

ipcMain.handle("list-users-with-counts", () => {
  return listUsersWithCounts();
});

ipcMain.handle("delete-user", (_ev, username: string) => {
  deleteUser(username);
  return { success: true };
});

ipcMain.handle("reset-active-user", () => {
  clearPersistedUser();
  return { success: true };
});

ipcMain.handle("get-default-scan-roots", () => {
  return getDefaultScanRoots();
});

// Recursively scan the given folders for DAW projects, streaming progress to
// the calling renderer via the "scan-progress" push channel.
ipcMain.handle(
  "scan-for-projects",
  async (event, roots: string[]) => {
    return await scanForProjects(roots, {
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("scan-progress", progress);
        }
      },
    });
  },
);

ipcMain.handle(
  "init-project",
  async (_ev, projectName: string, projectPath: string, opts: any) => {
    return await initProject(projectName, projectPath, opts);
  },
);

// Bulk-import: initialize many detected projects at once. Returns a per-item
// result so the onboarding UI can report partial failures without aborting the
// whole batch.
ipcMain.handle(
  "init-projects-bulk",
  async (
    _ev,
    entries: Array<{ projectName: string; projectPath: string; primaryFile?: string }>,
    opts: { author: string; storageMode?: "home" | "project" },
  ) => {
    const results: Array<{
      projectPath: string;
      success: boolean;
      projectId?: string;
      projectName?: string;
      error?: string;
    }> = [];
    for (const entry of entries) {
      try {
        const res = await initProject(entry.projectName, entry.projectPath, {
          author: opts.author,
          storageMode: opts.storageMode,
          primaryFile: entry.primaryFile,
        });
        results.push({
          projectPath: entry.projectPath,
          success: true,
          projectId: res?.projectId,
          projectName: res?.projectName,
        });
      } catch (err) {
        results.push({
          projectPath: entry.projectPath,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  },
);

ipcMain.handle(
  "commit-project",
  async (_ev, projectName: string, message = "No message", branch_name: string, author: string) => {
    return commitProject(projectName, message, branch_name, author);
  },
);

// Auto-draft watching: while a project is open, snapshot unsaved DAW saves as
// an unnamed draft so work is on disk before the user writes a commit message.
ipcMain.handle(
  "start-draft-watch",
  (_ev, projectName: string, projectPath: string, branch: string, author: string) => {
    return startDraftWatch(projectName, projectPath, branch, author);
  },
);

ipcMain.handle("stop-draft-watch", (_ev, projectName: string) => {
  stopDraftWatch(projectName);
  return { success: true };
});

ipcMain.handle(
  "add-preview-to-commit",
  async (_ev, projectName: string, commitId: string, previewFilePath: string) => {
    return await addPreviewToCommit(projectName, commitId, previewFilePath);
  }
);

ipcMain.handle(
  "get-preview-url",
  async (
    _ev,
    projectName: string,
    commitId: string,
    fileName: string,
  ) => {
    const { commitsDir: previewCommitsDir, casDir } = getProjectStorageDirs(projectName);
    const commitPath = getCommitPath(projectName, commitId, previewCommitsDir);
    const commitFilePath = path.join(commitPath, fileName);

    // Previews attached via addPreviewToCommit are copied into the commit dir,
    // but previews captured during a normal commit live only in CAS (fileName is
    // the preview's CAS hash). Prefer the commit-dir copy, fall back to CAS.
    const fullPath = fs.existsSync(commitFilePath)
      ? commitFilePath
      : getCasPath(fileName, casDir);

    return `dawpreview://active${fullPath.startsWith("/") ? "" : "/"}${fullPath}`;
  },
);

// Returns a dawpreview:// URL for a CAS hash so the renderer can fetch audio bytes for peak computation
ipcMain.handle("get-cas-preview-url", (_ev, hash: string) => {
  const localPath = getCasPath(hash);
  return `dawpreview://active${localPath.startsWith("/") ? "" : "/"}${localPath}`;
});

ipcMain.handle('get-commit-filemap', async (_ev, projectName: string, commitId: string) => {
  try {
    const { commitsDir } = getProjectStorageDirs(projectName);
    return getCommitFileMap(projectName, commitId, commitsDir);
  } catch (error) {
    console.error(`[main.ts] Error getting filemap for commit ${commitId}:`, error);
    // Return empty array or handle error gracefully
    return [];
  }
});

ipcMain.handle(
  "rollback-project",
  async (_ev, projectName: string, commitId: string, _bypassLimit = false) => {
    return rollbackProject(projectName, commitId);
  },
);
ipcMain.handle(
  "create-branch",
  async (
    _ev,
    projectName: string,
    newBranch: string,
    fromCommit?: string,
    author?: string,
  ) => {
    return createBranch(projectName, newBranch, fromCommit, author);
  },
);

ipcMain.handle(
  "switch-branch",
  async (
    _ev,
    projectName: string,
    branchName: string,
    projectId?: string,
  ) => {
    return switchBranch(projectName, branchName, projectId);
  },
);

// Preview project handlers
ipcMain.handle(
  "preview-project",
  async (
    event,
    projectName: string,
    commitId: string,
    branchName: string,
  ) => {
    return await previewProject(
      projectName,
      commitId,
      branchName,
      event.sender,
    );
  },
);

ipcMain.handle("cleanup-preview", async () => {
  return cleanupPreview();
});

ipcMain.handle("get-all-projects", async (_ev) => {
  const username = tryGetUsername();

  if (!username) {
    return {
      projects: [],
      debugInfo: {
        HOME: null,
        VCS_DIR: null,
        username: "NOT_SET",
        registryFile: "NOT_SET",
        registryExists: false,
      },
    };
  }

  const debugInfo = {
    HOME,
    VCS_DIR,
    username: "NOT_SET",
    registryFile: "NOT_SET",
    registryExists: false,
  };

  try {
    debugInfo.username = getUsername();
    debugInfo.registryFile = getRegistryFile();
    debugInfo.registryExists = fs.existsSync(debugInfo.registryFile);
  } catch (e: any) {
    debugInfo.username = `ERROR: ${e.message}`;
  }

  const projects = getAllProjects();

  // Return both projects and debug info
  return { projects, debugInfo };
});

// Per-project facet metadata (BPM, plugins, track count, preview availability)
// used by the Library page to build auto-facet tags and inline audio previews.
ipcMain.handle("get-project-facets", async (_ev) => {
  const username = tryGetUsername();
  if (!username) return {};
  try {
    return getProjectFacets();
  } catch (err) {
    console.error("[main.ts] Error getting project facets:", err);
    return {};
  }
});

ipcMain.handle(
  "get-project-log",
  async (_event, projectName: string, projectId?: string) => {
    return getProjectLog(projectName, projectId);
  },
);

ipcMain.handle(
  "get-local-project-log",
  async (_event, projectName: string, projectId?: string) => {
    return loadLocalProjectLog(projectName, projectId);
  },
);

ipcMain.handle(
  "update-project-log",
  async (_event, projectName: string, record: any) => {
    return updateProjectLog(projectName, record);
  },
);

ipcMain.handle(
  "update-project-registry",
  async (_event, projectName: string, record: any) => {
    return updateProjectInRegistry(projectName, record);
  },
);

ipcMain.handle(
  "delete-project",
  async (_event, projectName: string) => {
    try {
      const result = await deleteProject(projectName);
      return result;
    } catch (error) {
      console.error("[main.ts] Error deleting project:", error);
      throw error;
    }
  },
);

// Delete a single commit and its orphan files from local CAS
ipcMain.handle(
  "delete-commit",
  async (
    _event,
    commitId: string,
    projectName?: string,
  ) => {
    try {
      console.log(`[main.ts] Deleting commit: ${commitId}, Project: ${projectName}`);

      if (!projectName) {
          throw new Error("Project name is required for local commit deletion");
        }

        // 1. Get files used by this commit
        const { commitsDir, casDir } = getProjectStorageDirs(projectName);
        let commitFiles: any[] = [];
        try {
          commitFiles = getCommitFileMap(projectName, commitId, commitsDir);
        } catch (e) {
          console.warn(
            `[main.ts] Could not load filemap for commit ${commitId}, it may have partial data`,
          );
        }

        const commitHashes = new Set(
          commitFiles.map((f) => f.hash).filter((h) => h && h !== "empty"),
        );

        // 2. Load project log to find other commits
        const log = loadLocalProjectLog(projectName);
        if (!log) {
          throw new Error(`Project log not found for ${projectName}`);
        }

        // 3. Find files used by ALL OTHER commits in this project
        const otherHashes = new Set<string>();

        if (log.branches) {
          for (const branch of log.branches) {
            for (const commit of branch.commits) {
              // Skip the commit we're deleting
              if (commit.commit_id === commitId) continue;

              try {
                const otherFiles = getCommitFileMap(
                  projectName,
                  commit.commit_id,
                  commitsDir,
                );
                otherFiles.forEach((f) => {
                  if (f.hash && f.hash !== "empty") {
                    otherHashes.add(f.hash);
                  }
                });
              } catch (err) {
                // Skip missing filemaps
              }
            }
          }
        }

        // 4. Determine unique files (in commit but not in otherHashes)
        const uniqueHashes = new Set<string>();
        commitHashes.forEach((hash) => {
          if (!otherHashes.has(hash)) {
            uniqueHashes.add(hash);
          }
        });

        console.log(
          `[main.ts] Found ${uniqueHashes.size} unique hashes to delete`,
        );

        // 5. Delete unique files from CAS
        let deletedCount = 0;
        uniqueHashes.forEach((hash) => {
          try {
            const casPath = getCasPath(hash, casDir);
            if (fs.existsSync(casPath)) {
              fs.unlinkSync(casPath);
              deletedCount++;

              // Clean up empty directories
              const dir = path.dirname(casPath);
              if (fs.readdirSync(dir).length === 0) {
                fs.rmdirSync(dir);
                const parentDir = path.dirname(dir);
                if (fs.readdirSync(parentDir).length === 0) {
                  fs.rmdirSync(parentDir);
                }
              }
            }
          } catch (err) {
            console.error(`[main.ts] Error deleting hash ${hash}:`, err);
          }
        });

        // 6. Delete filemap.json and commit directory
        const commitDir = getCommitPath(projectName, commitId, commitsDir);
        if (fs.existsSync(commitDir)) {
          fs.rmSync(commitDir, { recursive: true, force: true });
        }

        // 7. Update project log (remove commit from branches)
        let commitedRemoved = false;
        if (log.branches) {
          log.branches.forEach((branch: any) => {
            const initialLength = branch.commits.length;
            branch.commits = branch.commits.filter(
              (c: any) => c.commit_id !== commitId,
            );
            if (branch.commits.length < initialLength) {
              commitedRemoved = true;
            }
          });
        }

        if (commitedRemoved) {
          saveProjectLog(projectName, log);
          console.log(`[main.ts] Removed commit ${commitId} from project log`);
        } else {
          console.warn(
            `[main.ts] Commit ${commitId} not found in project log branches`,
          );
        }

        return {
          success: true,
          message: `Deleted commit ${commitId} and ${deletedCount} unique files`,
          files_deleted: deletedCount,
        };
    } catch (error: any) {

      console.error("[main.ts] Error deleting commit:", error);
      return { success: false, error: error.message || "Unknown error" };
    }
  },
);

ipcMain.handle(
  "rollback-project-latest",
  async (_ev, projectName: string, branch: string) => {
    const log = await getProjectLog(projectName);
    const branchLog = log.branches.find(
      (b: { name: string }) => b.name === branch,
    );

    if (!branchLog || !branchLog.commits || branchLog.commits.length === 0) {
      console.error(
        `[rollback-project-latest] No commits found on branch: ${branchLog}`,
      );
      throw new Error(`No commits found on branch ${branchLog}`);
    }

    const latestCommitId =
      branchLog.commits[branchLog.commits.length - 1]?.commit_id;

    rollbackProject(projectName, latestCommitId);
  },
);

ipcMain.handle(
  "merge-branches",
  async (
    _ev,
    projectName: string,
    projectId: string,
    fromBranch: string,
    toBranch: string,
    author: string,
  ) => {
    // Get FROM branch's latest commit
    const log = await getProjectLog(projectName, projectId);
    const fromBranchLog = log.branches.find(
      (b: { name: string }) => b.name === fromBranch,
    );

    if (
      !fromBranchLog ||
      !fromBranchLog.commits ||
      fromBranchLog.commits.length === 0
    ) {
      throw new Error(`No commits found on branch ${fromBranch}`);
    }

    const latestCommitId =
      fromBranchLog.commits[fromBranchLog.commits.length - 1]?.commit_id;

    if (!latestCommitId) {
      throw new Error(`No commits found on branch ${fromBranch}`);
    }

    // Switch to TO branch
    await switchBranch(projectName, toBranch);

    // Rollback to FROM's latest commit (restores files)
    await rollbackProject(projectName, latestCommitId);

    // Commit the merge
    const mergeMessage = `Merged ${fromBranch} into ${toBranch}`;
    await commitProject(projectName, mergeMessage, toBranch, author);

    return { success: true, branch: toBranch, commitId: latestCommitId };
  },
);

// Tag Management Handlers
ipcMain.handle('add-tag-to-project', async (_ev, projectId: string, tag: string) => {
  try {
    const projects = getAllProjects();
    const localProject = projects.find((p: any) => p.project_id === projectId);
    if (!localProject) return { success: false, error: 'Project not found' };

    const currentTags = (localProject as any).tags || [];
    if (currentTags.includes(tag)) return { success: true, message: 'Tag already exists' };

    await updateProjectInRegistry((localProject as any).name, { tags: [...currentTags, tag] });
    console.log('[main.ts] Tag added:', tag);
    return { success: true };
  } catch (err: any) {
    console.error("[main.ts] Error adding tag:", err);
    throw err;
  }
});

ipcMain.handle('delete-tag-from-project', async (_ev, projectId: string, tag: string) => {
  try {
    const projects = getAllProjects();
    const localProject = projects.find((p: any) => p.project_id === projectId);
    if (!localProject) return { success: false, error: 'Project not found' };

    const currentTags = (localProject as any).tags || [];
    const newTags = currentTags.filter((t: any) => t !== tag);
    if (newTags.length !== currentTags.length) {
      await updateProjectInRegistry((localProject as any).name, { tags: newTags });
      console.log('[main.ts] Tag deleted:', tag);
    }
    return { success: true };
  } catch (err: any) {
    console.error("[main.ts] Error deleting tag:", err);
    throw err;
  }
});

// Tag Color Preferences Handlers
ipcMain.handle('load-tag-colors', async () => {
  try {
    const username = getUsername();
    const colorsFile = path.join(VCS_DIR, 'users', username, 'tag-colors.json');

    if (fs.existsSync(colorsFile)) {
      const data = fs.readFileSync(colorsFile, "utf-8");
      return JSON.parse(data);
    }
    return {}; // Empty object if no file exists
  } catch (err: any) {
    console.error("[main.ts] Error loading tag colors:", err);
    return {};
  }
});

ipcMain.handle('save-tag-color', async (_ev, tagName: string, color: string) => {
  try {
    const username = getUsername();
    const userDir = path.join(VCS_DIR, 'users', username);
    const colorsFile = path.join(userDir, 'tag-colors.json');

    // Ensure user directory exists
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // Load existing colors
    let colors: Record<string, string> = {};
    if (fs.existsSync(colorsFile)) {
      colors = JSON.parse(fs.readFileSync(colorsFile, 'utf-8'));
    }

    // Update with new color
    colors[tagName] = color;

    // Save back to file
    fs.writeFileSync(colorsFile, JSON.stringify(colors, null, 2));
    console.log('[main.ts] Tag color saved:', tagName, '->', color);
    return { success: true };
  } catch (err: any) {
    console.error('[main.ts] Error saving tag color:', err);
    throw err;
  }
});

ipcMain.handle("open-project", async (_ev, projectPath: string) => {
  return openProject(projectPath);
});

ipcMain.handle(
  "check-project-modified",
  async (_ev, projectPath: string, withinMinutes: number = 5) => {
    return checkProjectModified(projectPath, withinMinutes);
  },
);

ipcMain.handle(
  "get-project-last-save-time",
  async (_ev, projectPath: string) => {
    return getProjectLastSaveTime(projectPath);
  },
);

ipcMain.handle(
  "modify-project-details",
  async (_ev, projectId: string, updates: Record<string, any>) => {
    return modifyProjectDetails(projectId, updates);
  },
);

// Get project details
ipcMain.handle(
  "get-project-details",
  async (_ev, projectId: string) => {
    return getProjectDetails(projectId);
  },
);

// Detect DAW from folder path
ipcMain.handle("detect-daw", async (_ev, folderPath: string) => {
  return detectDAW(folderPath);
});

// List the real project-file candidates in a folder (excluding backups,
// autosaves, and cloud-sync conflict copies) so the UI can prompt the user
// to pick one when more than one is found.
ipcMain.handle("get-project-file-candidates", async (_ev, folderPath: string, ignoredFiles: string[] = []) => {
  const dawResult = detectDAW(folderPath);
  const candidates = getProjectFileCandidates(folderPath, ignoredFiles);
  return { ...dawResult, candidates };
});

// Whether this project's folder has a ".dawlabproject" directory (used by
// "Project Folder" storage mode to keep CAS/commits alongside the DAW files).
// It's never part of the tracked file set - the file viewer surfaces it
// separately, purely for the user's awareness.
ipcMain.handle("get-dawlabproject-status", async (_ev, projectPath: string) => {
  try {
    if (!projectPath || projectPath === "NA") return { exists: false };
    return { exists: fs.existsSync(path.join(projectPath, ".dawlabproject")) };
  } catch {
    return { exists: false };
  }
});

// Check if folder is empty
ipcMain.handle("is-folder-empty", async (_ev, folderPath: string) => {
  try {
    if (!fs.existsSync(folderPath)) {
      return true; // Non-existent folder is considered empty
    }

    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      return false; // Not a directory
    }

    const contents = fs.readdirSync(folderPath);
    // Filter out hidden files like .DS_Store
    const visibleFiles = contents.filter((file) => !file.startsWith("."));
    return visibleFiles.length === 0;
  } catch (err) {
    console.error("[main.ts] Error checking if folder is empty:", err);
    return true; // On error, assume empty to be safe
  }
});

// Open folder in Finder (macOS) or File Explorer (Windows/Linux)
ipcMain.handle("open-in-finder", async (_ev, folderPath: string) => {
  try {
    shell.showItemInFolder(folderPath);
    return { success: true };
  } catch (err) {
    console.error("[main.ts] Error opening folder:", err);
    throw err;
  }
});

// Plugin Scanner Handlers
ipcMain.handle("get-installed-plugins", async () => {
  return getInstalledPlugins();
});

ipcMain.handle("rescan-plugins", async () => {
  return rescanPlugins();
});

// Update project path and reset checkout state
ipcMain.handle(
  "update-project-path",
  async (_ev, projectId: string, newPath: string) => {
    try {
      const projects = loadRegistry();
      const ownedProject = Object.entries(projects).find(
        ([_, p]: [string, any]) => p.project_id === projectId,
      );

      if (!ownedProject) {
        throw new Error(`Project ${projectId} not found in registry`);
      }

      const [projectName] = ownedProject as [string, any];
      console.log(`[main.ts] Updating path for project: ${projectName}`);

      await updateProjectInRegistry(projectName, { path: newPath });

      // Update log and reset lastCheckout
      try {
        await updateProjectLog(projectName, {
          lastCheckout: null
        });
      } catch (logError) {
        // If lastCheckout wasn't in the log yet, we can safely ignore this
        console.warn(`[main.ts] Failed to update project log for project ${projectName}:`, logError);
      }

      return { success: true, projectType: "owned" };
    } catch (error) {
      console.error("[main.ts] Error updating project path:", error);
      throw error;
    }
  },
);

// Get project path from registry (single source of truth)
ipcMain.handle(
  "get-project-path",
  async (_ev, projectName: string) => {
    return getProjectPath(projectName);
  },
);

// Open external URL in system browser
ipcMain.handle("open-external-url", async (_ev, url: string) => {
  console.log("[main.ts] Opening external URL:", url);
  await shell.openExternal(url);
  return { success: true };
});

// Get local CAS storage usage
ipcMain.handle("get-local-cas-usage", async () => {
  try {
    const sizeBytes = calculateCasSize();
    console.log(
      `[main.ts] Local CAS size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`,
    );
    return sizeBytes;
  } catch (err: any) {
    console.error("[main.ts] Error calculating CAS size:", err);
    return 0;
  }
});

// Get CAS storage limit preference
ipcMain.handle("get-cas-storage-limit", async () => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    return manager.getCasStorageLimit();
  } catch (err: any) {
    console.error("[main.ts] Error getting CAS storage limit:", err);
    return null;
  }
});

// Set CAS storage limit preference
ipcMain.handle(
  "set-cas-storage-limit",
  async (_ev, limitBytes: number | null) => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      manager.setCasStorageLimit(limitBytes);
      console.log(
        `[main.ts] CAS storage limit set to: ${limitBytes ? (limitBytes / 1024 / 1024 / 1024).toFixed(2) + " GB" : "unlimited"}`,
      );
      return { success: true };
    } catch (err: any) {
      console.error("[main.ts] Error setting CAS storage limit:", err);
      throw err;
    }
  },
);

// Get default storage mode preference (used to seed the New Project modal)
ipcMain.handle("get-default-storage-mode", async () => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    return manager.getDefaultStorageMode();
  } catch (err: any) {
    console.error("[main.ts] Error getting default storage mode:", err);
    return "home";
  }
});

// Set default storage mode preference
ipcMain.handle(
  "set-default-storage-mode",
  async (_ev, mode: "home" | "project") => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      manager.setDefaultStorageMode(mode);
      return { success: true };
    } catch (err: any) {
      console.error("[main.ts] Error setting default storage mode:", err);
      throw err;
    }
  },
);

// Clean CAS storage
ipcMain.handle("get-cleanable-files", async () => {
  try {
    const files = getCleanableFiles();
    console.log(`[main.ts] Found ${files.length} cleanable files`);
    return files;
  } catch (err: any) {
    console.error("[main.ts] Error getting cleanable files:", err);
    throw err;
  }
});

ipcMain.handle("clean-cas-files", async (_ev, hashes: string[]) => {
  try {
    const stats = cleanCasFiles(hashes);
    console.log(
      `[main.ts] Cleaned ${stats.filesDeleted} files, freed ${stats.bytesFreed} bytes`,
    );
    return stats;
  } catch (err: any) {
    console.error("[main.ts] Error cleaning CAS files:", err);
    throw err;
  }
});

// ============================
// Folder Management Handlers
// ============================

// Get all folders for the current user
ipcMain.handle("get-folders", async () => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    return manager.getFolders();
  } catch (err: any) {
    console.error("[main.ts] Error getting folders:", err);
    return [];
  }
});

// Create a new folder
ipcMain.handle(
  "create-folder",
  async (_ev, name: string, parentId: string | null = null) => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      return manager.createFolder(name, parentId);
    } catch (err: any) {
      console.error("[main.ts] Error creating folder:", err);
      throw err;
    }
  },
);

// Rename a folder
ipcMain.handle(
  "rename-folder",
  async (_ev, folderId: string, newName: string) => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      return manager.renameFolder(folderId, newName);
    } catch (err: any) {
      console.error("[main.ts] Error renaming folder:", err);
      throw err;
    }
  },
);

// Delete a folder
ipcMain.handle("delete-folder", async (_ev, folderId: string) => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    return manager.deleteFolder(folderId);
  } catch (err: any) {
    console.error("[main.ts] Error deleting folder:", err);
    throw err;
  }
});

// Move a folder to a new parent
ipcMain.handle(
  "move-folder",
  async (_ev, folderId: string, newParentId: string | null) => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      return manager.moveFolder(folderId, newParentId);
    } catch (err: any) {
      console.error("[main.ts] Error moving folder:", err);
      throw err;
    }
  },
);

// Save all folders (bulk update from UI)
ipcMain.handle("save-folders", async (_ev, folders: any[]) => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    manager.setFolders(folders);
    return { success: true };
  } catch (err: any) {
    console.error("[main.ts] Error saving folders:", err);
    throw err;
  }
});

// Get project-to-folder mapping
ipcMain.handle("get-project-folder-map", async () => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    return manager.getProjectFolderMap();
  } catch (err: any) {
    console.error("[main.ts] Error getting project folder map:", err);
    return {};
  }
});

// Move a project to a folder
ipcMain.handle(
  "move-project-to-folder",
  async (_ev, projectId: string, folderId: string | null) => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      manager.moveProject(projectId, folderId);
      return { success: true };
    } catch (err: any) {
      console.error("[main.ts] Error moving project to folder:", err);
      throw err;
    }
  },
);

// Remove project from folder tracking (when project is deleted)
ipcMain.handle(
  "remove-project-from-folders",
  async (_ev, projectId: string) => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      manager.removeProject(projectId);
      return { success: true };
    } catch (err: any) {
      console.error("[main.ts] Error removing project from folders:", err);
      throw err;
    }
  },
);

// Clear folder manager cache (on logout)
ipcMain.handle("clear-folder-cache", () => {
  clearUserConfigCache();
  return { success: true };
});

// =======================
// Audio Library (bounces / references)
// =======================

// Sanitize a basename for safe use on disk while keeping it recognizable.
const sanitizeAudioFileName = (name: string): string =>
  name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim() || "audio";

// Get all imported audio items for the active user
ipcMain.handle("get-audio-items", async () => {
  try {
    const manager = getUserConfigManager(getUsername());
    return manager.getAudioItems();
  } catch (err) {
    console.error("[main.ts] Error getting audio items:", err);
    return [];
  }
});

// Import one or more audio files into the Library: each is copied into managed
// storage (media/<id>/<fileName>) so playback survives the original moving.
ipcMain.handle(
  "import-audio-files",
  async (_ev, sourcePaths: string[], folderId: string | null = null) => {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    const mediaDir = getUserMediaDir(username);
    const created: AudioItem[] = [];

    for (const sourcePath of sourcePaths || []) {
      try {
        if (!fs.existsSync(sourcePath)) continue;
        const ext = path.extname(sourcePath).toLowerCase();
        if (!AUDIO_EXTENSIONS.includes(ext)) continue;

        const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const baseName = sanitizeAudioFileName(path.basename(sourcePath));
        const itemDir = path.join(mediaDir, id);
        fs.mkdirSync(itemDir, { recursive: true });
        const destPath = path.join(itemDir, baseName);
        fs.copyFileSync(sourcePath, destPath);

        const item: AudioItem = {
          id,
          name: path.basename(baseName, path.extname(baseName)),
          fileName: baseName,
          filePath: destPath,
          ext,
          folderId,
          position: manager.getAudioItems().length,
          addedAt: new Date().toISOString(),
        };
        manager.addAudioItem(item);
        created.push(item);
      } catch (err) {
        console.error(`[main.ts] Error importing audio file ${sourcePath}:`, err);
      }
    }
    return created;
  },
);

// Resolve an audio item to a dawpreview:// URL the renderer can stream/play.
ipcMain.handle("get-audio-url", async (_ev, id: string) => {
  const manager = getUserConfigManager(getUsername());
  const item = manager.getAudioItems().find((a) => a.id === id);
  if (!item) return null;
  const fullPath = item.filePath;
  return `dawpreview://active${fullPath.startsWith("/") ? "" : "/"}${fullPath}`;
});

// Delete an audio item: remove the config entry and its copied file on disk.
ipcMain.handle("delete-audio-item", async (_ev, id: string) => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    const item = manager.getAudioItems().find((a) => a.id === id);
    manager.removeAudioItem(id);
    if (item) {
      const itemDir = path.join(getUserMediaDir(username), id);
      fs.rmSync(itemDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (err) {
    console.error("[main.ts] Error deleting audio item:", err);
    throw err;
  }
});

// Move an audio item to a folder (or root if folderId is null)
ipcMain.handle(
  "move-audio-item-to-folder",
  async (_ev, id: string, folderId: string | null) => {
    try {
      const manager = getUserConfigManager(getUsername());
      manager.moveAudioItem(id, folderId);
      return { success: true };
    } catch (err) {
      console.error("[main.ts] Error moving audio item:", err);
      throw err;
    }
  },
);

// Rename an audio item's display name
ipcMain.handle("rename-audio-item", async (_ev, id: string, name: string) => {
  try {
    const manager = getUserConfigManager(getUsername());
    manager.renameAudioItem(id, name);
    return { success: true };
  } catch (err) {
    console.error("[main.ts] Error renaming audio item:", err);
    throw err;
  }
});

// ============================
// Warning Preferences Handlers
// ============================

// Check if a warning should be skipped
ipcMain.handle("should-skip-warning", async (_ev, warningType: string) => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    return manager.shouldSkipWarning(warningType);
  } catch (err: any) {
    console.error("[main.ts] Error checking warning preference:", err);
    return false;
  }
});

// Set warning preference
ipcMain.handle(
  "set-warning-preference",
  async (_ev, warningType: string, skipWarning: boolean) => {
    try {
      const username = getUsername();
      const manager = getUserConfigManager(username);
      manager.setWarningPreference(warningType, skipWarning);
      return { success: true };
    } catch (err: any) {
      console.error("[main.ts] Error setting warning preference:", err);
      throw err;
    }
  },
);

// Reset a specific warning preference
ipcMain.handle("reset-warning-preference", async (_ev, warningType: string) => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    manager.resetWarningPreference(warningType);
    return { success: true };
  } catch (err: any) {
    console.error("[main.ts] Error resetting warning preference:", err);
    throw err;
  }
});

// Reset all warning preferences
ipcMain.handle("reset-all-warning-preferences", async () => {
  try {
    const username = getUsername();
    const manager = getUserConfigManager(username);
    manager.resetAllWarningPreferences();
    return { success: true };
  } catch (err: any) {
    console.error("[main.ts] Error resetting all warning preferences:", err);
    throw err;
  }
});
