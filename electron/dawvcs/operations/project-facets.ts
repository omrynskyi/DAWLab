import { loadRegistry } from '../core/registry';
import { loadLocalProjectLog } from '../core/log';
import type { ProjectLog } from '../types';

/**
 * Per-project facet metadata surfaced on the Library page. Derived from the
 * project log's latest metadata extraction and its most recent commit — the
 * source data the Library uses to build auto-facet tags (BPM ranges, plugins,
 * track counts) and to know whether an audio preview can be played inline.
 */
export interface ProjectFacetData {
    /** Tempo in BPM, from the latest metadata extraction, falling back to the log's stored bpm. */
    bpm: number | null;
    /** Plugins detected in the project, deduped by name (instrument flag preserved). */
    plugins: Array<{ name: string; is_instrument?: boolean }>;
    /** Total track count from the latest metadata extraction. */
    trackCount: number | null;
    /** Whether the most recent commit has an audio preview attached. */
    hasPreview: boolean;
    /** The most recent commit id on the current branch, if any. */
    latestCommitId: string | null;
    /** Filename of the audio preview on the latest commit, needed to build its dawpreview:// URL. */
    previewFile: string | null;
}

/** A commit as stored in the log — includes `preview_file`, which the shared ProjectLog type omits. */
type CommitWithPreview = ProjectLog['branches'][number]['commits'][number] & { preview_file?: string };

/**
 * Derive Library facet data from a single project log. Pure — no disk access —
 * so it can be unit-tested against fixture logs.
 */
export function deriveProjectFacetData(log: ProjectLog | null | undefined): ProjectFacetData {
    const empty: ProjectFacetData = {
        bpm: null,
        plugins: [],
        trackCount: null,
        hasPreview: false,
        latestCommitId: null,
        previewFile: null,
    };
    if (!log) return empty;

    const metadata = log.metadata ?? null;

    const bpm = metadata?.tempo ?? log.bpm ?? null;
    const trackCount = metadata?.total_tracks ?? null;

    // Dedupe plugins by name so the facet list doesn't repeat the same plugin
    // instantiated on multiple tracks.
    const seen = new Set<string>();
    const plugins: ProjectFacetData['plugins'] = [];
    for (const p of metadata?.plugins ?? []) {
        if (!p?.name) continue;
        const key = p.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        plugins.push({ name: p.name, is_instrument: p.is_instrument });
    }

    // The latest commit is the last one pushed onto the current branch.
    const branch =
        log.branches?.find((b) => b.name === log.current_branch) ?? log.branches?.[0];
    const commits = (branch?.commits ?? []) as CommitWithPreview[];
    const latest = commits.length > 0 ? commits[commits.length - 1] : null;

    return {
        bpm,
        plugins,
        trackCount,
        hasPreview: Boolean(latest?.preview_file),
        latestCommitId: latest?.commit_id ?? null,
        previewFile: latest?.preview_file ?? null,
    };
}

/**
 * Load facet data for every registered project, keyed by project_id.
 * Used by the `get-project-facets` IPC handler.
 */
export function getProjectFacets(): Record<string, ProjectFacetData> {
    const registry = loadRegistry();
    const result: Record<string, ProjectFacetData> = {};

    for (const info of Object.values(registry) as Array<{ name: string; project_id: string }>) {
        if (!info?.project_id) continue;
        try {
            const log = loadLocalProjectLog(info.name, info.project_id);
            result[String(info.project_id)] = deriveProjectFacetData(log);
        } catch (err) {
            console.error(`[project-facets] Failed to derive facets for ${info.name}:`, err);
        }
    }

    return result;
}
