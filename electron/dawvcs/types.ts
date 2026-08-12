export interface FileMapEntry {
    path: string
    hash: string
}

export interface ProjectInfo {
    project_id: string
    name: string
    path: string
    daw: string
    genre?: string
    description?: string
    key?: string
    bpm?: number
    privacy_flag?: string
    tags?: string[]
    storage_mode?: 'home' | 'project'
}

export interface PluginInfo {
    name: string;
    manufacturer?: string;
    type?: string;
    is_instrument?: boolean;
}

export interface ExtractedMetadata {
    daw_version: string;
    tempo: number;
    time_signature: string;
    total_tracks: number;
    plugins: PluginInfo[];
    track_summary: {
        audio: string[];
        midi: string[];
        return: string[];
        group?: string[];
    };
}

export interface ProjectLog {
    id: string;
    name: string;
    daw: string;
    privacy_flag: string;
    collaborators: Array<{ username: string; role: string }>;
    description: string | null;
    bpm: number | null;
    key: string | null;
    current_branch: string;
    branches: Array<{
        name: string;
        commits: Array<{
            commit_id: string;
            timestamp: string;
            message: string;
            author: string;
        }>;
    }>;
    lastCheckout: { commitId: string; timestamp: string } | null;
    owner_id: string | null;
    metadata?: ExtractedMetadata | null;
    // A single unnamed snapshot auto-captured when the DAW project is saved but
    // not yet committed. It is stored like a commit (CAS + commits dir) but kept
    // out of any branch's `commits` list, so it stays invisible in history until
    // the user names it. Overwritten by each new capture; cleared on a real commit.
    draft?: { commit_id: string; timestamp: string } | null;
}
