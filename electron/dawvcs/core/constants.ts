import os from 'os';
import path from 'path';
import fs from 'fs';

let currentUsername: string | null = null;

export const setUsername = (username: string) => {
    currentUsername = username;
};

export const getUsername = (): string => {
    if (!currentUsername) {
        throw new Error('Username not set. Call setUsername() first.');
    }
    return currentUsername;
};

export const clearUsername = () => {
    currentUsername = null;
};

/**
 * Forgets the persisted active user entirely (removes current-user.json), so
 * the next launch is treated as a genuine first run and shows onboarding. Used
 * when the last remaining user is deleted.
 */
export const clearPersistedUser = () => {
    currentUsername = null;
    try {
        fs.rmSync(CURRENT_USER_FILE(), { force: true });
    } catch {
        // Already absent — nothing to do.
    }
};


export const HOME = os.homedir();
export const VCS_DIR = path.join(HOME, '.dawlab');
export const CAS_DIR = path.join(VCS_DIR, 'cas');

// ============================================================================
// USERNAME PERSISTENCE — the username namespaces registry/logs on disk
// (getUserDir below), so it must survive app restarts. Falls back to the OS
// account name on first run.
// ============================================================================

const CURRENT_USER_FILE = () => path.join(VCS_DIR, 'current-user.json');

function sanitizeUsernameCandidate(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30);
}

export const persistUsername = (username: string) => {
    setUsername(username);
    try {
        fs.mkdirSync(VCS_DIR, { recursive: true });
        fs.writeFileSync(CURRENT_USER_FILE(), JSON.stringify({ username }));
    } catch (err) {
        console.error('[constants.ts] Failed to persist username:', err);
    }
};

/**
 * Loads the persisted username into memory if one exists. Unlike the old
 * behavior, this does NOT auto-create a user on first run — a null return means
 * the app is on genuine first launch and should show onboarding. The onboarding
 * flow (or Settings) persists the username via persistUsername.
 */
export const initializeUsername = (): string | null => {
    try {
        const raw = fs.readFileSync(CURRENT_USER_FILE(), 'utf8');
        const data = JSON.parse(raw);
        if (data?.username) {
            setUsername(data.username);
            return data.username;
        }
    } catch {
        // No persisted username yet — first run. Leave username unset.
    }
    return null;
};

/**
 * A suggested username derived from the OS account, sanitized. Used only to
 * prefill the onboarding username input — it is not persisted until the user
 * confirms it.
 */
export const getSuggestedUsername = (): string => {
    const sanitized = sanitizeUsernameCandidate(os.userInfo().username || '');
    return sanitized.length >= 3 ? sanitized : `user_${sanitized || 'default'}`;
};

/** True once a username has been persisted (i.e. onboarding's first step is done). */
export const hasCompletedOnboarding = (): boolean => {
    try {
        const raw = fs.readFileSync(CURRENT_USER_FILE(), 'utf8');
        return Boolean(JSON.parse(raw)?.username);
    } catch {
        return false;
    }
};

/**
 * Removes a local user's namespace (registry, commits, logs, config) from
 * ~/.dawlab/users/<username>. Projects stored in "project" mode keep their own
 * .dawlabproject history on disk; only this user's home-library index is removed.
 */
export const deleteUser = (username: string): void => {
    const clean = sanitizeUsernameCandidate(username);
    if (!clean) return;
    const dir = path.join(VCS_DIR, 'users', clean);
    fs.rmSync(dir, { recursive: true, force: true });
};

/** Lists all local users (directory names under ~/.dawlab/users). */
export const listUsers = (): string[] => {
    try {
        const usersDir = path.join(VCS_DIR, 'users');
        return fs
            .readdirSync(usersDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    } catch {
        return [];
    }
};

/** Number of projects in a given user's registry (0 if the user has none yet). */
export const getUserProjectCount = (username: string): number => {
    try {
        const raw = fs.readFileSync(getRegistryFile(username), 'utf8');
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? Object.keys(data).length : 0;
    } catch {
        return 0;
    }
};

/** Lists all local users alongside how many projects each one has. */
export const listUsersWithCounts = (): Array<{ username: string; projectCount: number }> => {
    return listUsers().map((username) => ({
        username,
        projectCount: getUserProjectCount(username),
    }));
};

// Dynamic path generators
export const getUserDir = (username?: string) => path.join(VCS_DIR, 'users', username || getUsername());
export const getRegistryFile = (username?: string) => path.join(getUserDir(username), 'registry.json');
export const getCommitsDir = (username?: string) => path.join(getUserDir(username), 'commits');
export const getLogsDir = (username?: string) => path.join(getUserDir(username), 'logs');
// Managed copies of user-imported audio files (bounces / references) that are not
// DAWVCS projects. Each item lives in its own subdirectory: media/<id>/<fileName>.
export const getUserMediaDir = (username?: string) => path.join(getUserDir(username), 'media');

// DEPRECATED: These will be removed once refactoring is complete
export const REGISTRY_FILE = path.join(VCS_DIR, 'registry.json');
export const COMMITS_DIR = path.join(VCS_DIR, 'commits');
export const LOGS_DIR = path.join(VCS_DIR, 'logs');
