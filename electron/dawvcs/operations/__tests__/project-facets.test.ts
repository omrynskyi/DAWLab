import { describe, it, expect } from 'vitest'
import { deriveProjectFacetData } from '../project-facets'
import type { ProjectLog } from '../../types'

function makeLog(overrides: Partial<ProjectLog> = {}): ProjectLog {
  return {
    id: 'p1',
    name: 'Song',
    daw: 'Ableton Live',
    privacy_flag: 'local',
    collaborators: [],
    description: null,
    bpm: null,
    key: null,
    current_branch: 'main',
    branches: [{ name: 'main', commits: [] }],
    lastCheckout: null,
    owner_id: null,
    ...overrides,
  } as ProjectLog
}

describe('deriveProjectFacetData', () => {
  it('returns empty facets for a null log', () => {
    expect(deriveProjectFacetData(null)).toEqual({
      bpm: null,
      plugins: [],
      trackCount: null,
      hasPreview: false,
      latestCommitId: null,
      previewFile: null,
    })
  })

  it('prefers extracted metadata tempo over the log bpm', () => {
    const log = makeLog({
      bpm: 100,
      metadata: { tempo: 128, total_tracks: 12, plugins: [] } as any,
    })
    expect(deriveProjectFacetData(log).bpm).toBe(128)
  })

  it('falls back to the log bpm when no metadata tempo exists', () => {
    const log = makeLog({ bpm: 90 })
    expect(deriveProjectFacetData(log).bpm).toBe(90)
  })

  it('exposes track count from metadata', () => {
    const log = makeLog({ metadata: { tempo: 120, total_tracks: 24, plugins: [] } as any })
    expect(deriveProjectFacetData(log).trackCount).toBe(24)
  })

  it('dedupes plugins by name (case-insensitive) and preserves instrument flag', () => {
    const log = makeLog({
      metadata: {
        tempo: 120,
        total_tracks: 3,
        plugins: [
          { name: 'Serum', is_instrument: true },
          { name: 'serum', is_instrument: true },
          { name: 'Valhalla', is_instrument: false },
        ],
      } as any,
    })
    const { plugins } = deriveProjectFacetData(log)
    expect(plugins).toEqual([
      { name: 'Serum', is_instrument: true },
      { name: 'Valhalla', is_instrument: false },
    ])
  })

  it('skips plugins without a name', () => {
    const log = makeLog({
      metadata: {
        tempo: 120,
        total_tracks: 1,
        plugins: [{ name: '' }, { name: 'Pro-Q' }],
      } as any,
    })
    expect(deriveProjectFacetData(log).plugins).toEqual([{ name: 'Pro-Q', is_instrument: undefined }])
  })

  it('reports the latest commit id from the current branch', () => {
    const log = makeLog({
      current_branch: 'main',
      branches: [
        {
          name: 'main',
          commits: [
            { commit_id: 'c1', timestamp: '', message: '', author: '' },
            { commit_id: 'c2', timestamp: '', message: '', author: '' },
          ],
        },
      ],
    })
    expect(deriveProjectFacetData(log).latestCommitId).toBe('c2')
  })

  it('detects an available preview on the latest commit', () => {
    const log = makeLog({
      branches: [
        {
          name: 'main',
          commits: [
            { commit_id: 'c1', timestamp: '', message: '', author: '', preview_file: 'preview.mp3' } as any,
          ],
        },
      ],
    })
    const result = deriveProjectFacetData(log)
    expect(result.hasPreview).toBe(true)
    expect(result.previewFile).toBe('preview.mp3')
  })

  it('reports no preview when the latest commit lacks one', () => {
    const log = makeLog({
      branches: [
        { name: 'main', commits: [{ commit_id: 'c1', timestamp: '', message: '', author: '' }] },
      ],
    })
    const result = deriveProjectFacetData(log)
    expect(result.hasPreview).toBe(false)
    expect(result.latestCommitId).toBe('c1')
  })

  it('resolves the current branch rather than the first branch', () => {
    const log = makeLog({
      current_branch: 'feature',
      branches: [
        { name: 'main', commits: [{ commit_id: 'm1', timestamp: '', message: '', author: '' }] },
        { name: 'feature', commits: [{ commit_id: 'f1', timestamp: '', message: '', author: '' }] },
      ],
    })
    expect(deriveProjectFacetData(log).latestCommitId).toBe('f1')
  })
})
