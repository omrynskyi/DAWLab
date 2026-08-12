import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  countProjectFiles,
  detectDAW,
  isIgnorableCandidateName,
  getProjectFileCandidates,
  resolvePrimaryFile,
  ProjectFileAmbiguityError,
} from '../daw-detection'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dawlab-daw-detection-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function touch(relPath: string) {
  const full = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, 'x')
}

describe('isIgnorableCandidateName', () => {
  it('flags autosave and backup filenames', () => {
    expect(isIgnorableCandidateName('Song_autosave.flp')).toBe(true)
    expect(isIgnorableCandidateName('Song_bak.als')).toBe(true)
    expect(isIgnorableCandidateName('Song-bak.rpp')).toBe(true)
    expect(isIgnorableCandidateName('Song.RPP-bak')).toBe(true)
  })

  it('flags cloud-sync conflict copies', () => {
    expect(isIgnorableCandidateName('Song (conflicted copy 2024-01-01).flp')).toBe(true)
    expect(isIgnorableCandidateName('Song (1).als')).toBe(true)
  })

  it('does not flag ordinary project filenames', () => {
    expect(isIgnorableCandidateName('Song.flp')).toBe(false)
    expect(isIgnorableCandidateName('Chorus Idea.als')).toBe(false)
    expect(isIgnorableCandidateName('Backing Vocals.rpp')).toBe(false)
  })
})

describe('countProjectFiles', () => {
  it('counts real candidate files and excludes backups', () => {
    touch('Song.flp')
    touch('Song_autosave.flp')
    const { count, files } = countProjectFiles(tmpDir)
    expect(count).toBe(1)
    expect(files).toEqual(['Song.flp'])
  })

  it('excludes explicitly ignored files', () => {
    touch('Song.flp')
    touch('Idea.flp')
    const { count, files } = countProjectFiles(tmpDir, ['Idea.flp'])
    expect(count).toBe(1)
    expect(files).toEqual(['Song.flp'])
  })

  it('returns zero for a non-directory path', () => {
    touch('Song.flp')
    const filePath = path.join(tmpDir, 'Song.flp')
    expect(countProjectFiles(filePath)).toEqual({ count: 0, files: [] })
  })

  it('returns zero for a nonexistent path', () => {
    expect(countProjectFiles(path.join(tmpDir, 'nope'))).toEqual({ count: 0, files: [] })
  })
})

describe('detectDAW', () => {
  it('detects a single .flp file directly', () => {
    touch('Song.flp')
    const filePath = path.join(tmpDir, 'Song.flp')
    const result = detectDAW(filePath)
    expect(result).toEqual({ daw: 'FL Studio', isValid: true })
  })

  it('detects FL Studio from a folder with one .flp file', () => {
    touch('Song.flp')
    expect(detectDAW(tmpDir)).toEqual({ daw: 'FL Studio', isValid: true })
  })

  it('flags multiple .logicx bundles as ambiguous', () => {
    fs.mkdirSync(path.join(tmpDir, 'A.logicx'))
    fs.mkdirSync(path.join(tmpDir, 'B.logicx'))
    const result = detectDAW(tmpDir)
    expect(result.isValid).toBe(false)
    expect(result.daw).toBe('Unknown')
  })

  it('reports invalid for a folder with no recognizable DAW files', () => {
    touch('notes.txt')
    const result = detectDAW(tmpDir)
    expect(result.isValid).toBe(false)
  })
})

describe('getProjectFileCandidates', () => {
  it('lists real files across DAW types, excluding noise', () => {
    touch('Song.flp')
    touch('Old Idea.als')
    touch('Song (conflicted copy 2024-01-01).flp')
    const candidates = getProjectFileCandidates(tmpDir).sort()
    expect(candidates).toEqual(['Old Idea.als', 'Song.flp'])
  })
})

describe('resolvePrimaryFile', () => {
  it('keeps the existing primary file when it is still a valid candidate', () => {
    touch('Song.flp')
    touch('Other.flp')
    const result = resolvePrimaryFile(tmpDir, { primaryFile: 'Song.flp', ignoredFiles: ['Other.flp'] })
    expect(result).toEqual({ primaryFile: 'Song.flp', changed: false })
  })

  it('auto-adopts the sole remaining candidate as a rename when the tracked file disappears', () => {
    touch('Song_v2.flp')
    const result = resolvePrimaryFile(tmpDir, { primaryFile: 'Song.flp', ignoredFiles: [] })
    expect(result).toEqual({ primaryFile: 'Song_v2.flp', changed: true, reason: 'renamed' })
  })

  it('migrates a legacy project with no stored primary file when exactly one candidate exists', () => {
    touch('Song.flp')
    const result = resolvePrimaryFile(tmpDir, { primaryFile: null, ignoredFiles: [] })
    expect(result).toEqual({ primaryFile: 'Song.flp', changed: true, reason: 'migrated' })
  })

  it('throws ProjectFileAmbiguityError with candidates when multiple files remain', () => {
    touch('Intro.flp')
    touch('Chorus.flp')
    expect(() => resolvePrimaryFile(tmpDir, { primaryFile: null, ignoredFiles: [] })).toThrow(ProjectFileAmbiguityError)
    try {
      resolvePrimaryFile(tmpDir, { primaryFile: null, ignoredFiles: [] })
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectFileAmbiguityError)
      expect((err as ProjectFileAmbiguityError).candidates.sort()).toEqual(['Chorus.flp', 'Intro.flp'])
    }
  })

  it('throws when the tracked file is gone and no replacement exists', () => {
    expect(() => resolvePrimaryFile(tmpDir, { primaryFile: 'Song.flp', ignoredFiles: [] })).toThrow(
      /missing/i
    )
  })

  it('respects ignoredFiles when deciding whether a rename is unambiguous', () => {
    touch('Song_v2.flp')
    touch('Sketch.flp')
    const result = resolvePrimaryFile(tmpDir, { primaryFile: 'Song.flp', ignoredFiles: ['Sketch.flp'] })
    expect(result).toEqual({ primaryFile: 'Song_v2.flp', changed: true, reason: 'renamed' })
  })
})
