import type { Project } from '@/types/library';

/**
 * Auto-facets turn per-project metadata into a unified, filterable tag surface.
 * Each facet has a `type` (which drives its colour/grouping in the filter panel)
 * and a `value` (the thing being filtered on). Manual user tags are modelled as
 * just another facet type so filtering can treat everything uniformly.
 */
export type FacetType = 'daw' | 'bpm' | 'plugin' | 'size' | 'manual';

export interface Facet {
  type: FacetType;
  /** Canonical value used for matching (see facetKey). */
  value: string;
  /** Human-readable label shown on the chip. */
  label: string;
  /** Only set for plugin facets — lets the panel group instruments vs. effects. */
  isInstrument?: boolean;
}

/** Human-readable heading for each facet group in the filter panel. */
export const FACET_GROUP_LABELS: Record<FacetType, string> = {
  daw: 'DAW',
  bpm: 'Tempo',
  plugin: 'Plugins',
  size: 'Session size',
  manual: 'Tags',
};

/** Order the facet groups appear in the filter panel. */
export const FACET_GROUP_ORDER: FacetType[] = ['daw', 'bpm', 'plugin', 'size', 'manual'];

/** Default chip colour per facet type. Manual tags fall back to their saved colour. */
const FACET_COLORS: Record<FacetType, string> = {
  daw: '#a855f7',
  bpm: '#22c55e',
  plugin: '#f59e0b',
  size: '#06b6d4',
  manual: '#007bff',
};

/**
 * Stable identity for a facet, used as the key in the active-filter set and to
 * dedupe facets across projects. Case-insensitive on value so "Serum"/"serum"
 * collapse together.
 */
export function facetKey(facet: Pick<Facet, 'type' | 'value'>): string {
  return `${facet.type}::${facet.value.toLowerCase()}`;
}

/** Resolve the chip colour for a facet (manual tags may have a user-picked colour). */
export function facetColor(facet: Facet, tagColors: Record<string, string>): string {
  if (facet.type === 'manual') return tagColors[facet.value] || FACET_COLORS.manual;
  return FACET_COLORS[facet.type];
}

/** Bucket a BPM value into a 10-wide range label, e.g. 128 → "120–130 BPM". */
export function bpmBucketLabel(bpm: number): string {
  const rounded = Math.round(bpm);
  const lo = Math.floor(rounded / 10) * 10;
  return `${lo}–${lo + 10} BPM`;
}

/** Bucket a track count into a session-size label. */
export function trackCountBucketLabel(count: number): string {
  if (count < 10) return 'Under 10 tracks';
  if (count < 25) return '10–25 tracks';
  if (count < 40) return '25–40 tracks';
  return '40+ tracks';
}

/**
 * Derive every facet for a single project. Pure — safe to unit-test and to call
 * inside a useMemo. Unknown/missing metadata simply yields fewer facets.
 */
export function deriveFacets(project: Project): Facet[] {
  const facets: Facet[] = [];

  if (project.daw && project.daw !== 'Unknown') {
    facets.push({ type: 'daw', value: project.daw, label: project.daw });
  }

  if (project.bpm != null && Number.isFinite(project.bpm) && project.bpm > 0) {
    const label = bpmBucketLabel(project.bpm);
    facets.push({ type: 'bpm', value: label, label });
  }

  const seenPlugins = new Set<string>();
  for (const plugin of project.plugins ?? []) {
    if (!plugin?.name) continue;
    const key = plugin.name.toLowerCase();
    if (seenPlugins.has(key)) continue;
    seenPlugins.add(key);
    facets.push({
      type: 'plugin',
      value: plugin.name,
      label: plugin.name,
      isInstrument: plugin.is_instrument,
    });
  }

  if (project.trackCount != null && project.trackCount > 0) {
    const label = trackCountBucketLabel(project.trackCount);
    facets.push({ type: 'size', value: label, label });
  }

  for (const tag of project.tags ?? []) {
    if (!tag) continue;
    facets.push({ type: 'manual', value: tag, label: tag });
  }

  return facets;
}

/**
 * Collect all unique facets across a set of projects, grouped by type and sorted
 * for display. Used to build the filter panel from whatever is currently visible.
 */
export function collectFacets(projects: Project[]): Map<FacetType, Facet[]> {
  const byType = new Map<FacetType, Map<string, Facet>>();

  for (const project of projects) {
    for (const facet of deriveFacets(project)) {
      let group = byType.get(facet.type);
      if (!group) {
        group = new Map();
        byType.set(facet.type, group);
      }
      const k = facetKey(facet);
      if (!group.has(k)) group.set(k, facet);
    }
  }

  const result = new Map<FacetType, Facet[]>();
  for (const type of FACET_GROUP_ORDER) {
    const group = byType.get(type);
    if (!group || group.size === 0) continue;
    const facets = Array.from(group.values());
    // Plugins sort instruments first, then alphabetically; others alphabetically.
    facets.sort((a, b) => {
      if (type === 'plugin' && !!a.isInstrument !== !!b.isInstrument) {
        return a.isInstrument ? -1 : 1;
      }
      return a.label.localeCompare(b.label);
    });
    result.set(type, facets);
  }
  return result;
}

/**
 * Does a project satisfy the active filter selection?
 * Semantics: OR within a facet type, AND across facet types. An empty selection
 * matches everything.
 */
export function projectMatchesFacets(project: Project, activeFacetKeys: Set<string>): boolean {
  if (activeFacetKeys.size === 0) return true;

  // Group the active keys by facet type.
  const activeByType = new Map<FacetType, Set<string>>();
  for (const key of activeFacetKeys) {
    const type = key.split('::')[0] as FacetType;
    if (!activeByType.has(type)) activeByType.set(type, new Set());
    activeByType.get(type)!.add(key);
  }

  // Index this project's facet keys by type.
  const projectByType = new Map<FacetType, Set<string>>();
  for (const facet of deriveFacets(project)) {
    if (!projectByType.has(facet.type)) projectByType.set(facet.type, new Set());
    projectByType.get(facet.type)!.add(facetKey(facet));
  }

  // Every active type must be satisfied by at least one matching facet (AND across types).
  for (const [type, wanted] of activeByType) {
    const has = projectByType.get(type);
    if (!has) return false;
    let intersects = false;
    for (const key of wanted) {
      if (has.has(key)) {
        intersects = true;
        break;
      }
    }
    if (!intersects) return false;
  }

  return true;
}
