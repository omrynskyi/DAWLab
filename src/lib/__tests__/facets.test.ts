import { describe, it, expect } from 'vitest';
import type { Project } from '@/types/library';
import {
  deriveFacets,
  collectFacets,
  projectMatchesFacets,
  facetKey,
  bpmBucketLabel,
  trackCountBucketLabel,
} from '../facets';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Song',
    daw: 'Ableton Live',
    ...overrides,
  } as Project;
}

describe('bpmBucketLabel', () => {
  it('buckets into 10-wide ranges', () => {
    expect(bpmBucketLabel(128)).toBe('120–130 BPM');
    expect(bpmBucketLabel(120)).toBe('120–130 BPM');
    expect(bpmBucketLabel(129.9)).toBe('130–140 BPM'); // rounds to 130
    expect(bpmBucketLabel(90)).toBe('90–100 BPM');
  });
});

describe('trackCountBucketLabel', () => {
  it('buckets track counts', () => {
    expect(trackCountBucketLabel(4)).toBe('Under 10 tracks');
    expect(trackCountBucketLabel(10)).toBe('10–25 tracks');
    expect(trackCountBucketLabel(24)).toBe('10–25 tracks');
    expect(trackCountBucketLabel(25)).toBe('25–40 tracks');
    expect(trackCountBucketLabel(40)).toBe('40+ tracks');
    expect(trackCountBucketLabel(120)).toBe('40+ tracks');
  });
});

describe('deriveFacets', () => {
  it('derives daw, bpm, plugin, size and manual facets', () => {
    const project = makeProject({
      daw: 'Logic Pro',
      bpm: 128,
      trackCount: 24,
      plugins: [
        { name: 'Serum', is_instrument: true },
        { name: 'Valhalla', is_instrument: false },
      ],
      tags: ['release'],
    });
    const facets = deriveFacets(project);
    const byType = (t: string) => facets.filter(f => f.type === t).map(f => f.value);

    expect(byType('daw')).toEqual(['Logic Pro']);
    expect(byType('bpm')).toEqual(['120–130 BPM']);
    expect(byType('plugin').sort()).toEqual(['Serum', 'Valhalla']);
    expect(byType('size')).toEqual(['10–25 tracks']);
    expect(byType('manual')).toEqual(['release']);
  });

  it('omits the DAW facet when unknown', () => {
    const facets = deriveFacets(makeProject({ daw: 'Unknown' }));
    expect(facets.some(f => f.type === 'daw')).toBe(false);
  });

  it('omits bpm when null, zero, or non-finite', () => {
    expect(deriveFacets(makeProject({ bpm: null as any })).some(f => f.type === 'bpm')).toBe(false);
    expect(deriveFacets(makeProject({ bpm: 0 })).some(f => f.type === 'bpm')).toBe(false);
    expect(deriveFacets(makeProject({ bpm: NaN })).some(f => f.type === 'bpm')).toBe(false);
  });

  it('dedupes plugins case-insensitively and preserves instrument flag', () => {
    const facets = deriveFacets(makeProject({
      plugins: [
        { name: 'Serum', is_instrument: true },
        { name: 'serum', is_instrument: true },
      ],
    }));
    const plugins = facets.filter(f => f.type === 'plugin');
    expect(plugins).toHaveLength(1);
    expect(plugins[0].isInstrument).toBe(true);
  });
});

describe('collectFacets', () => {
  it('groups unique facets by type across projects, sorting instruments first', () => {
    const projects = [
      makeProject({ id: 'a', daw: 'Ableton Live', plugins: [{ name: 'Valhalla', is_instrument: false }] }),
      makeProject({ id: 'b', daw: 'Logic Pro', plugins: [{ name: 'Serum', is_instrument: true }, { name: 'Valhalla', is_instrument: false }] }),
    ];
    const grouped = collectFacets(projects);

    expect(grouped.get('daw')!.map(f => f.value)).toEqual(['Ableton Live', 'Logic Pro']);
    // Instrument (Serum) sorts before effect (Valhalla).
    expect(grouped.get('plugin')!.map(f => f.value)).toEqual(['Serum', 'Valhalla']);
  });

  it('omits facet groups with no members', () => {
    const grouped = collectFacets([makeProject({ daw: 'Unknown', bpm: null as any })]);
    expect(grouped.has('daw')).toBe(false);
    expect(grouped.has('bpm')).toBe(false);
  });
});

describe('projectMatchesFacets', () => {
  const abletonFast = makeProject({ id: 'a', daw: 'Ableton Live', bpm: 128, plugins: [{ name: 'Serum', is_instrument: true }] });
  const logicSlow = makeProject({ id: 'b', daw: 'Logic Pro', bpm: 90, plugins: [{ name: 'Valhalla' }] });

  it('matches everything when no filters are active', () => {
    expect(projectMatchesFacets(abletonFast, new Set())).toBe(true);
  });

  it('ORs within a facet type', () => {
    const active = new Set([
      facetKey({ type: 'daw', value: 'Ableton Live' }),
      facetKey({ type: 'daw', value: 'Logic Pro' }),
    ]);
    expect(projectMatchesFacets(abletonFast, active)).toBe(true);
    expect(projectMatchesFacets(logicSlow, active)).toBe(true);
  });

  it('ANDs across facet types', () => {
    const active = new Set([
      facetKey({ type: 'daw', value: 'Ableton Live' }),
      facetKey({ type: 'bpm', value: '120–130 BPM' }),
    ]);
    expect(projectMatchesFacets(abletonFast, active)).toBe(true); // matches both
    expect(projectMatchesFacets(logicSlow, active)).toBe(false); // wrong daw and bpm
  });

  it('excludes a project missing a selected facet type entirely', () => {
    const active = new Set([facetKey({ type: 'plugin', value: 'Serum' })]);
    expect(projectMatchesFacets(abletonFast, active)).toBe(true);
    expect(projectMatchesFacets(logicSlow, active)).toBe(false);
  });

  it('matches plugin filter case-insensitively', () => {
    const active = new Set([facetKey({ type: 'plugin', value: 'SERUM' })]);
    expect(projectMatchesFacets(abletonFast, active)).toBe(true);
  });
});
