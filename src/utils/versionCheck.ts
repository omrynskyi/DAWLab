export interface VersionCheckResult {
  isOutdated: boolean;
  currentVersion: string;
  latestVersion: string;
  /** Where to download the latest version. */
  releaseUrl: string;
}

const REPO = 'omrynskyi/DAWLab';
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const TIMEOUT_MS = 8000;

/** "v1.3.0" / "1.3.0-beta.1" → [1, 3, 0]; null if it isn't a version. */
export function parseVersion(version: string): number[] | null {
  const match = version.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
}

/** True when `latest` is a strictly higher major.minor.patch than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// One lookup per app session: every mounted Activity panel shares it, and it
// keeps us far below GitHub's unauthenticated rate limit.
let pending: Promise<VersionCheckResult> | null = null;

/**
 * Compares the running version with the latest published GitHub release.
 * Never rejects: offline, rate-limited or malformed responses count as
 * "up to date" so the app never nags on a failed check.
 */
export function checkVersion(): Promise<VersionCheckResult> {
  if (!pending) pending = fetchLatest();
  return pending;
}

async function fetchLatest(): Promise<VersionCheckResult> {
  const currentVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const upToDate: VersionCheckResult = {
    isOutdated: false,
    currentVersion,
    latestVersion: currentVersion,
    releaseUrl: RELEASES_PAGE,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!res.ok) return upToDate;
    const release = await res.json();
    const tag = typeof release?.tag_name === 'string' ? release.tag_name : '';
    if (!parseVersion(tag)) return upToDate;
    return {
      isOutdated: isNewerVersion(tag, currentVersion),
      currentVersion,
      latestVersion: tag.replace(/^v/i, ''),
      releaseUrl: typeof release.html_url === 'string' ? release.html_url : RELEASES_PAGE,
    };
  } catch {
    return upToDate;
  } finally {
    clearTimeout(timer);
  }
}
