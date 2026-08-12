import fs from 'fs'
import { captureDraft } from '../dawvcs/operations/commit'

// Watches a project's folder and auto-captures an unnamed draft snapshot a short
// while after the DAW writes files, so unsaved work is safely on disk before the
// user names a commit. One watch per project; the current project is (re)started
// by the renderer whenever it opens a project or switches branch.

// Quiet period after the last file-change event before we snapshot. DAWs write
// project files in bursts (and sometimes via temp-file + rename); waiting for
// things to settle avoids hashing a half-written save.
const QUIET_MS = 4000

// DAWLab's own storage folders live inside the project in "project" storage
// mode. Ignore events under them so our own draft writes don't retrigger a capture.
const IGNORED_SEGMENTS = ['.dawlab', '.dawlabproject', 'Backup', 'Project File Backups']

interface Watch {
  watcher: fs.FSWatcher
  timer: NodeJS.Timeout | null
  branch: string
  author: string
  capturing: boolean
}

const watches = new Map<string, Watch>()

function isIgnoredEvent(filename: string | null): boolean {
  if (!filename) return false
  const parts = filename.split(/[\\/]/)
  return parts.some((p) => IGNORED_SEGMENTS.includes(p))
}

function schedule(projectName: string, delay = QUIET_MS): void {
  const w = watches.get(projectName)
  if (!w) return
  if (w.timer) clearTimeout(w.timer)
  w.timer = setTimeout(() => { void runCapture(projectName) }, delay)
}

async function runCapture(projectName: string): Promise<void> {
  const w = watches.get(projectName)
  if (!w) return
  // A save landed mid-capture — reschedule so we snapshot the final state too.
  if (w.capturing) { schedule(projectName); return }
  w.capturing = true
  try {
    await captureDraft(projectName, w.branch, w.author)
  } catch (err) {
    console.error(`[draftWatcher] Capture failed for ${projectName}:`, err)
  } finally {
    w.capturing = false
  }
}

/**
 * Start (or restart) watching a project for saves. Also schedules an immediate
 * catch-up capture, so saves the user made while DAWLab wasn't watching (e.g.
 * before reopening the project) are captured too.
 */
export function startDraftWatch(
  projectName: string,
  projectPath: string,
  branch = 'main',
  author = ''
): { watching: boolean } {
  stopDraftWatch(projectName)

  if (!projectName || !projectPath || projectPath === 'NA' || projectPath === '/' || !fs.existsSync(projectPath)) {
    return { watching: false }
  }

  let watcher: fs.FSWatcher
  try {
    watcher = fs.watch(projectPath, { recursive: true }, (_event, filename) => {
      if (isIgnoredEvent(filename)) return
      schedule(projectName)
    })
  } catch (err) {
    console.error(`[draftWatcher] Failed to watch ${projectPath}:`, err)
    return { watching: false }
  }

  watches.set(projectName, { watcher, timer: null, branch, author, capturing: false })

  // Catch up on any changes made while we weren't watching. captureDraft is a
  // no-op cost when nothing changed (CAS dedups), so an unconditional pass is fine.
  schedule(projectName, 1000)

  return { watching: true }
}

export function stopDraftWatch(projectName: string): void {
  const w = watches.get(projectName)
  if (!w) return
  if (w.timer) clearTimeout(w.timer)
  try { w.watcher.close() } catch { /* already closed */ }
  watches.delete(projectName)
}

export function stopAllDraftWatches(): void {
  for (const name of [...watches.keys()]) stopDraftWatch(name)
}
