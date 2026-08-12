// types/project.types.ts  (or src/types/project.types.ts)

/**
 * Represents a single plugin used in a project
 */
export interface PluginInfo {
  name: string;
  manufacturer?: string;
  type?: string;         // "VST3" | "AU" | "VST2"
  is_instrument?: boolean;
}

/**
 * Metadata extracted from DAW project files
 */
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

/**
 * Represents a single commit/save in the project history
 */
export interface Commit {
  commit_id: string;
  timestamp: string;  // Format: YYYYMMDDHHmm
  message: string;
  author: string;
  preview_file?: string;
}

/**
 * Represents a branch with its commits
 */
export interface Branch {
  name: string;
  commits: Commit[];
}

export interface ProjectCollaborator {
  username: string;
  role: string;
  user_id?: string;
  pending?: boolean;
  created_at?: string;
}

/**
 * The complete version control log for a project
 * Note: project_path is NOT stored in logs - use registry.getProjectPath() instead
 */
export interface ProjectLog {
  current_branch: string;
  id: string;
  name: string;
  privacy_flag: string;
  collaborators?: ProjectCollaborator[];
  description: string | null;
  bpm: number | null;       // Beats per minute
  key: string | null;       // Musical key (e.g., "C major", "A minor")
  daw?: string | null;      // DAW type (e.g., "logic", "ableton", "fl")
  branches: Branch[];  // Array of branch objects with name and commits
  lastCheckout?: {      // Tracks the currently checked-out commit
    commitId: string;
    timestamp: string;  // YYYYMMDDHHmmss format - when this commit was checked out
  };
  metadata?: ExtractedMetadata | null;
  owner_id?: string | null;
  access_source?: "owned" | "shared" | "unknown";
}

