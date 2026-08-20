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
    /** Whether any commit on the current branch has an audio preview attached. */
    hasPreview: boolean;
    /**
     * Commit id whose preview we surface: the latest commit that has one, else
     * the most recent commit that does ("latest or most available"). The preview
     * file lives in this commit's storage, so this is the id used to resolve its
     * dawpreview:// URL.
     */
    previewCommitId: string | null;
    /** Filename of the audio preview on `previewCommitId`, needed to build its dawpreview:// URL. */
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
        previewCommitId: null,
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

    // Commits are ordered oldest→newest on the current branch. Walk backwards for
    // the most recent commit that actually carries a preview: prefer the latest
    // commit, but fall back to the most recent one that has a preview so a project
    // whose newest commit lacks a preview still shows one ("latest or most available").
    const branch =
        log.branches?.find((b) => b.name === log.current_branch) ?? log.branches?.[0];
    const commits = (branch?.commits ?? []) as CommitWithPreview[];
    let previewCommit: CommitWithPreview | null = null;
    for (let i = commits.length - 1; i >= 0; i--) {
        if (commits[i]?.preview_file) {
            previewCommit = commits[i];
            break;
        }
    }

    return {
        bpm,
        plugins,
        trackCount,
        hasPreview: Boolean(previewCommit),
        previewCommitId: previewCommit?.commit_id ?? null,
        previewFile: previewCommit?.preview_file ?? null,
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
