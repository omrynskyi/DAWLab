import { openProject } from '../core/fs-utils'
import { loadProjectLog } from '../core/log'
import { rollbackProject } from './rollback'
import os from 'os'
import path from 'path'
import fs from 'fs'

export async function previewProject(projectName: string, commitIdInput: string | number, branchName: string, sender: Electron.WebContents) {
  const commitId = String(commitIdInput)

  const projectLog = await loadProjectLog(projectName)
  if (!projectLog) throw new Error(`Project '${projectName}' not initialized`)

  sender.send('preview-status-update', 'Loading files...')

  const dawLabDir = path.join(os.tmpdir(), 'DAWLab')
  if (!fs.existsSync(dawLabDir)) fs.mkdirSync(dawLabDir, { recursive: true })

  const branch = projectLog.branches.find((b: any) => b.name === branchName)
  if (!branch) throw new Error(`Branch '${branchName}' not found in project log`)

  const commit = branch.commits?.find((c: any) => String(c.commit_id) === commitId)
  if (!commit) throw new Error(`Commit '${commitId}' not found in project log`)

  const commitDir = path.join(dawLabDir, commitId)
  if (!fs.existsSync(commitDir)) fs.mkdirSync(commitDir, { recursive: true })

  await rollbackProject(projectName, commitId, commitDir)

  sender.send('preview-status-update', 'Opening project...')
  await openProject(commitDir)
}

export async function cleanupPreview() {
  const dawLabDir = path.join(os.tmpdir(), 'DAWLab')
  if (fs.existsSync(dawLabDir)) {
    fs.rmSync(dawLabDir, { recursive: true, force: true })
  }
}
