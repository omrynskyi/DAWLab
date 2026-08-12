import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getAllFiles } from '../fs-utils'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawlab-fs-utils-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function touch(relPath: string) {
  const full = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, 'x')
}

describe('getAllFiles', () => {
  it('lists all files in a project by relative path', async () => {
    touch('Song.flp')
    touch('Samples/kick.wav')
    const files = await getAllFiles(tmpDir)
    expect(Object.keys(files).sort()).toEqual(['Samples/kick.wav', 'Song.flp'])
  })

  it('never walks into .dawlabproject, even without being told to ignore it', async () => {
    touch('Song.flp')
    touch('.dawlabproject/commits/20260101/filemap.json')
    touch('.dawlabproject/cas/aa/bb.bin')
    const files = await getAllFiles(tmpDir)
    expect(Object.keys(files)).toEqual(['Song.flp'])
  })

  it('never walks into .dawlab', async () => {
    touch('Song.flp')
    touch('.dawlab/registry.json')
    const files = await getAllFiles(tmpDir)
    expect(Object.keys(files)).toEqual(['Song.flp'])
  })

  it('excludes explicitly ignored top-level files', async () => {
    touch('Song.flp')
    touch('Old Idea.als')
    const files = await getAllFiles(tmpDir, ['Old Idea.als'])
    expect(Object.keys(files)).toEqual(['Song.flp'])
  })

  it('excludes everything under an ignored folder', async () => {
    touch('Song.flp')
    touch('Sketches/idea1.als')
    touch('Sketches/idea2.als')
    const files = await getAllFiles(tmpDir, ['Sketches'])
    expect(Object.keys(files)).toEqual(['Song.flp'])
  })

  it('still skips the "Backup" folder as before', async () => {
    touch('Song.flp')
    touch('Backup/Song_old.flp')
    const files = await getAllFiles(tmpDir)
    expect(Object.keys(files)).toEqual(['Song.flp'])
  })
})
