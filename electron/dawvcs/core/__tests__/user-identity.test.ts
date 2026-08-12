import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import realOs from 'os'

// Redirect ~/.dawlab to an isolated temp dir so these tests never touch the
// real home directory. constants.ts computes VCS_DIR from os.homedir() at
// import time, so the mock must be in place before it is (dynamically) imported.
const tmpHome = fs.mkdtempSync(path.join(realOs.tmpdir(), 'dawlab-identity-'))

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  const patched = { ...actual, homedir: () => tmpHome }
  return { ...patched, default: patched }
})

async function freshConstants() {
  vi.resetModules()
  return await import('../constants')
}

beforeEach(() => {
  fs.rmSync(path.join(tmpHome, '.dawlab'), { recursive: true, force: true })
})

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
  fs.mkdirSync(tmpHome, { recursive: true })
})

describe('first-run gate', () => {
  it('initializeUsername returns null when no user has been persisted', async () => {
    const c = await freshConstants()
    expect(c.initializeUsername()).toBeNull()
    expect(c.hasCompletedOnboarding()).toBe(false)
  })

  it('loads the persisted username on subsequent runs', async () => {
    const c = await freshConstants()
    c.persistUsername('producer_x')
    expect(c.hasCompletedOnboarding()).toBe(true)

    const c2 = await freshConstants()
    expect(c2.initializeUsername()).toBe('producer_x')
    expect(c2.getUsername()).toBe('producer_x')
  })

  it('getSuggestedUsername returns a sanitized, valid-length name', async () => {
    const c = await freshConstants()
    const suggestion = c.getSuggestedUsername()
    expect(suggestion.length).toBeGreaterThanOrEqual(3)
    expect(suggestion).toMatch(/^[a-z0-9_]+$/)
  })
})

describe('listUsers', () => {
  it('returns an empty list before any user directory exists', async () => {
    const c = await freshConstants()
    expect(c.listUsers()).toEqual([])
  })

  it('lists user namespace directories, sorted', async () => {
    const c = await freshConstants()
    const usersDir = path.join(tmpHome, '.dawlab', 'users')
    fs.mkdirSync(path.join(usersDir, 'zed'), { recursive: true })
    fs.mkdirSync(path.join(usersDir, 'alex'), { recursive: true })
    fs.writeFileSync(path.join(usersDir, 'not-a-dir.json'), '{}')

    expect(c.listUsers()).toEqual(['alex', 'zed'])
  })

  it('reports project counts per user from each registry', async () => {
    const c = await freshConstants()
    const usersDir = path.join(tmpHome, '.dawlab', 'users')
    fs.mkdirSync(path.join(usersDir, 'alex'), { recursive: true })
    fs.mkdirSync(path.join(usersDir, 'zed'), { recursive: true })
    fs.writeFileSync(
      path.join(usersDir, 'alex', 'registry.json'),
      JSON.stringify({ ProjA: {}, ProjB: {} }),
    )
    // zed has no registry file yet -> 0 projects.

    expect(c.getUserProjectCount('alex')).toBe(2)
    expect(c.getUserProjectCount('zed')).toBe(0)
    expect(c.listUsersWithCounts()).toEqual([
      { username: 'alex', projectCount: 2 },
      { username: 'zed', projectCount: 0 },
    ])
  })
})

describe('deleteUser / clearPersistedUser', () => {
  it('removes a user namespace directory', async () => {
    const c = await freshConstants()
    const usersDir = path.join(tmpHome, '.dawlab', 'users')
    fs.mkdirSync(path.join(usersDir, 'alex'), { recursive: true })
    fs.mkdirSync(path.join(usersDir, 'zed'), { recursive: true })

    c.deleteUser('alex')
    expect(c.listUsers()).toEqual(['zed'])
  })

  it('clearPersistedUser triggers first-run on the next launch', async () => {
    const c = await freshConstants()
    c.persistUsername('solo_user')
    expect(c.hasCompletedOnboarding()).toBe(true)

    c.clearPersistedUser()
    expect(c.hasCompletedOnboarding()).toBe(false)

    const c2 = await freshConstants()
    expect(c2.initializeUsername()).toBeNull()
  })
})
