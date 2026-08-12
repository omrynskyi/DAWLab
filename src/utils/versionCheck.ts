export interface VersionCheckResult {
  isOutdated: boolean;
  currentVersion: string;
  latestVersion: string;
}

export async function checkVersion(): Promise<VersionCheckResult> {
  const currentVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';
  return { isOutdated: false, currentVersion, latestVersion: currentVersion };
}
