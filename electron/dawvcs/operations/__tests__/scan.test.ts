import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { scanForProjects } from '../scan'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawlab-scan-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function touch(relPath: string) {
  const full = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, 'x')
}

function mkdir(relPath: string) {
  fs.mkdirSync(path.join(tmpDir, relPath), { recursive: true })
}

describe('scanForProjects', () => {
  it('detects FL, Ableton, and Logic projects and skips noise directories', async () => {
    touch('Beats/Track1/Track1.flp')
    touch('Beats/Track1/Backup/old_autosave.flp') // inside Backup -> ignored
    touch('Beats/Track2/Song.als')
    mkdir('Beats/Track2/Ableton Project Info')
    mkdir('Logic/Cool Song/Cool Song.logicx') // Logic bundle folder
    touch('node_modules/pkg/thing.flp') // dependency cache -> skipped
    touch('.cache/secret.als') // hidden dir -> skipped

    const res = await scanForProjects([tmpDir])
    const names = res.map((r) => r.name).sort()
    expect(names).toEqual(['Cool Song', 'Track1', 'Track2'])

    const byName = Object.fromEntries(res.map((r) => [r.name, r.dawType]))
    expect(byName['Track1']).toBe('FL Studio')
    expect(byName['Track2']).toBe('Ableton Live')
    expect(byName['Cool Song']).toBe('Logic Pro X')

    // Nothing is registered in this test, so nothing is already imported.
    expect(res.every((r) => r.alreadyImported === false)).toBe(true)
  })

  it('does not descend into a folder once it is detected as a project', async () => {
    // A project folder that also contains a nested project-looking subfolder.
    touch('Song/Song.flp')
    touch('Song/Stems/Stems.flp')

    const res = await scanForProjects([tmpDir])
    expect(res).toHaveLength(1)
    expect(res[0].name).toBe('Song')
  })

  it('surfaces every candidate when a folder holds multiple project files', async () => {
    touch('Multi/A.flp')
    touch('Multi/B.flp')

    const res = await scanForProjects([tmpDir])
    expect(res).toHaveLength(1)
    expect(res[0].candidates.sort()).toEqual(['A.flp', 'B.flp'])
    expect(res[0].primaryFile).toBeDefined()
  })

  it('reports progress as it walks', async () => {
    touch('A/A.flp')
    const events: number[] = []
    await scanForProjects([tmpDir], {
      onProgress: (p) => events.push(p.found),
    })
    expect(events.length).toBeGreaterThan(0)
    expect(events[events.length - 1]).toBe(1)
  })

  it('ignores roots that do not exist', async () => {
    const res = await scanForProjects([path.join(tmpDir, 'nope')])
    expect(res).toEqual([])
  })
})
