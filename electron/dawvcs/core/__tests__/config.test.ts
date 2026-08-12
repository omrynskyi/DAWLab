import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import realOs from 'os'

// Redirect ~/.dawlab to an isolated temp dir so these tests never touch the real
// home directory. constants.ts (which config.ts uses to resolve the user dir)
// computes VCS_DIR from os.homedir() at import time, so the mock must be in place
// before the modules are (dynamically) imported.
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

const USER = 'audio_tester'

function makeAudio(overrides: Partial<import('../config').AudioItem> = {}): import('../config').AudioItem {
  return {
    id: `audio-${Math.random().toString(36).slice(2, 8)}`,
    name: 'My Bounce',
    fileName: 'My Bounce.wav',
    filePath: '/tmp/media/x/My Bounce.wav',
    ext: '.wav',
    folderId: null,
    position: 0,
    addedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  fs.rmSync(path.join(tmpHome, '.dawlab'), { recursive: true, force: true })
})

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.mkdirSync(tmpHome, { recursive: true })
})

describe('UserConfigManager audio items', () => {
  it('adds an audio item and persists it to disk', async () => {
    const { UserConfigManager } = await freshConfig()
    const manager = new UserConfigManager(USER)
    const item = makeAudio({ id: 'audio-1' })

    manager.addAudioItem(item)
    expect(manager.getAudioItems()).toHaveLength(1)

    // A fresh instance loads from the persisted config.json.
    const reloaded = new UserConfigManager(USER)
    expect(reloaded.getAudioItems()).toEqual([item])
  })

  it('removes an audio item by id', async () => {
    const { UserConfigManager } = await freshConfig()
    const manager = new UserConfigManager(USER)
    manager.addAudioItem(makeAudio({ id: 'audio-1' }))
    manager.addAudioItem(makeAudio({ id: 'audio-2' }))

    expect(manager.removeAudioItem('audio-1')).toBe(true)
    expect(manager.getAudioItems().map(a => a.id)).toEqual(['audio-2'])
    expect(manager.removeAudioItem('nope')).toBe(false)
  })

  it('moves an audio item to a folder and back to root', async () => {
    const { UserConfigManager } = await freshConfig()
    const manager = new UserConfigManager(USER)
    manager.addAudioItem(makeAudio({ id: 'audio-1', folderId: null }))

    expect(manager.moveAudioItem('audio-1', 'folder-9')).toBe(true)
    expect(manager.getAudioItems()[0].folderId).toBe('folder-9')

    expect(manager.moveAudioItem('audio-1', null)).toBe(true)
    expect(manager.getAudioItems()[0].folderId).toBeNull()

    expect(manager.moveAudioItem('missing', 'folder-9')).toBe(false)
  })

  it('renames an audio item', async () => {
    const { UserConfigManager } = await freshConfig()
    const manager = new UserConfigManager(USER)
    manager.addAudioItem(makeAudio({ id: 'audio-1', name: 'Old' }))

    expect(manager.renameAudioItem('audio-1', 'New Name')).toBe(true)
    expect(manager.getAudioItems()[0].name).toBe('New Name')
    expect(manager.renameAudioItem('missing', 'x')).toBe(false)
  })

  it('replaces all audio items via setAudioItems', async () => {
    const { UserConfigManager } = await freshConfig()
    const manager = new UserConfigManager(USER)
    manager.addAudioItem(makeAudio({ id: 'audio-1' }))

    const next = [makeAudio({ id: 'audio-2' }), makeAudio({ id: 'audio-3' })]
    manager.setAudioItems(next)
    expect(manager.getAudioItems().map(a => a.id)).toEqual(['audio-2', 'audio-3'])
  })
})

describe('UserConfigManager deleteFolder reassigns audio items', () => {
  it('moves audio items in a deleted folder back to root', async () => {
    const { UserConfigManager } = await freshConfig()
    const manager = new UserConfigManager(USER)
    const folder = manager.createFolder('Refs')
    manager.addAudioItem(makeAudio({ id: 'audio-1', folderId: folder.id }))
    manager.addAudioItem(makeAudio({ id: 'audio-2', folderId: null }))

    manager.deleteFolder(folder.id)

    const byId = Object.fromEntries(manager.getAudioItems().map(a => [a.id, a.folderId]))
    expect(byId['audio-1']).toBeNull()
    expect(byId['audio-2']).toBeNull()
  })
})
