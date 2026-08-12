import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import realOs from 'os'

// Redirect ~/.dawlab to an isolated temp dir so these tests never touch the real
// home directory. constants.ts computes VCS_DIR from os.homedir() at import time,
// so the mock must be in place before it is (dynamically) imported.
const tmpHome = fs.mkdtempSync(path.join(realOs.tmpdir(), 'dawlab-config-'))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  const patched = { ...actual, homedir: () => tmpHome }
  return { ...patched, default: patched }
})

async function freshConfig() {
  vi.resetModules()
  return await import('../config')
}

function configFile(username: string): string {
  return path.join(tmpHome, '.dawlab', 'users', username, 'config.json')
}

beforeEach(() => {
  fs.rmSync(path.join(tmpHome, '.dawlab'), { recursive: true, force: true })
})

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.mkdirSync(tmpHome, { recursive: true })
})

describe('UserConfigManager — watched directories', () => {
  it('adds a watched directory with a resolved path, source, and timestamp', async () => {
    const { UserConfigManager } = await freshConfig()
    const m = new UserConfigManager('tester')

    const list = m.addWatchedDirectory('/music/Beats', 'onboarding')

    expect(list).toHaveLength(1)
    expect(list[0].path).toBe(path.resolve('/music/Beats'))
    expect(list[0].source).toBe('onboarding')
    expect(typeof list[0].addedAt).toBe('string')
    expect(Number.isNaN(Date.parse(list[0].addedAt))).toBe(false)
  })

  it('de-dupes by resolved path, keeping the first entry', async () => {
    const { UserConfigManager } = await freshConfig()
    const m = new UserConfigManager('tester')

    m.addWatchedDirectory('/music/beats', 'onboarding')
    const list = m.addWatchedDirectory('/music/beats/', 'project') // trailing slash → same resolved path

    expect(list).toHaveLength(1)
    expect(list[0].source).toBe('onboarding')
  })

  it('removes a watched directory by resolved path', async () => {
    const { UserConfigManager } = await freshConfig()
    const m = new UserConfigManager('tester')
    m.addWatchedDirectory('/a', 'manual')
    m.addWatchedDirectory('/b', 'manual')

    const list = m.removeWatchedDirectory('/a/') // trailing slash still matches

    expect(list.map((d) => d.path)).toEqual([path.resolve('/b')])
  })

  it('persists watched directories across manager instances', async () => {
    const { UserConfigManager } = await freshConfig()
    new UserConfigManager('tester').addWatchedDirectory('/x', 'project')

    const reloaded = new UserConfigManager('tester')
    expect(reloaded.getWatchedDirectories().map((d) => d.path)).toEqual([path.resolve('/x')])
  })
})

describe('UserConfigManager — ignored project suggestions', () => {
  it('adds and de-dupes ignored project paths', async () => {
    const { UserConfigManager } = await freshConfig()
    const m = new UserConfigManager('tester')

    m.addIgnoredProjectPath('/proj/song')
    m.addIgnoredProjectPath('/proj/song/') // duplicate after resolve

    expect(m.getIgnoredProjectPaths()).toEqual([path.resolve('/proj/song')])
  })

  it('clears all ignored project paths', async () => {
    const { UserConfigManager } = await freshConfig()
    const m = new UserConfigManager('tester')
    m.addIgnoredProjectPath('/proj/a')
    m.addIgnoredProjectPath('/proj/b')

    m.clearIgnoredProjectPaths()

    expect(m.getIgnoredProjectPaths()).toEqual([])
  })
})

describe('UserConfigManager — legacy config compatibility', () => {
  it('defaults watched/ignored fields to empty for a config file that predates them', async () => {
    const { UserConfigManager } = await freshConfig()
    const file = configFile('legacy')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
      file,
      JSON.stringify({ folders: [], projectFolderMap: {}, audioItems: [] }),
    )

    const m = new UserConfigManager('legacy')

    expect(m.getWatchedDirectories()).toEqual([])
    expect(m.getIgnoredProjectPaths()).toEqual([])
  })
})
