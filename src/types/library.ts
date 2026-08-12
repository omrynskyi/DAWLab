// Shared types for Library and SharedWithMe pages

export type Project = {
    id: string;
    name: string;
    description?: string;
    genre?: string;
    daw?: string;
    privacy_flag?: string;
    bpm?: number;
    key?: string;
    created_at?: string;
    folderId?: string | null;
    position?: number;
    owner_id?: string;
    owner_name?: string;
    collaborators?: string[];
    tags?: string[];
    // Facet metadata surfaced on the Library page (from the latest commit's
    // extracted metadata). Absent until metadata extraction has run.
    plugins?: Array<{ name: string; is_instrument?: boolean }>;
    trackCount?: number | null;
    hasPreview?: boolean;
    latestCommitId?: string | null;
    previewFile?: string | null;
};

export type Folder = {
    id: string;
    name: string;
    expanded: boolean;
    position: number;
    parentId?: string | null;
};
