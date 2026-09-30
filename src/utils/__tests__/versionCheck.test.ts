import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNewerVersion, parseVersion } from '../versionCheck';

describe('parseVersion', () => {
  it('reads tags with or without a v prefix', () => {
    expect(parseVersion('v1.3.0')).toEqual([1, 3, 0]);
    expect(parseVersion('1.10.2')).toEqual([1, 10, 2]);
  });

  it('ignores pre-release suffixes', () => {
    expect(parseVersion('v2.0.0-beta.1')).toEqual([2, 0, 0]);
  });

  it('rejects things that are not versions', () => {
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('v1.2')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it('compares numerically, not as strings', () => {
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(false);
  });

  it('is false for the same or an older version', () => {
    expect(isNewerVersion('v1.2.0', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.1.9', '1.2.0')).toBe(false);
  });

  it('is false when either side is unparseable', () => {
    expect(isNewerVersion('nightly', '1.2.0')).toBe(false);
  });
});

describe('checkVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const load = async (fetchImpl: () => Promise<unknown>) => {
    vi.stubEnv('VITE_APP_VERSION', '1.2.0');
    vi.stubGlobal('fetch', vi.fn(fetchImpl));
    return (await import('../versionCheck')).checkVersion;
  };

  it('flags a newer GitHub release and links to it', async () => {
    const checkVersion = await load(async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v1.3.0', html_url: 'https://github.com/r/releases/tag/v1.3.0' }),
    }));
    expect(await checkVersion()).toEqual({
      isOutdated: true,
      currentVersion: '1.2.0',
      latestVersion: '1.3.0',
      releaseUrl: 'https://github.com/r/releases/tag/v1.3.0',
    });
  });

  it('treats network failures as up to date', async () => {
    const checkVersion = await load(async () => { throw new Error('offline'); });
    expect((await checkVersion()).isOutdated).toBe(false);
  });

  it('treats error responses (e.g. rate limiting) as up to date', async () => {
    const checkVersion = await load(async () => ({ ok: false, json: async () => ({}) }));
    expect((await checkVersion()).isOutdated).toBe(false);
  });

  it('asks GitHub only once per session', async () => {
    const checkVersion = await load(async () => ({ ok: true, json: async () => ({ tag_name: 'v1.2.0' }) }));
    await checkVersion();
    await checkVersion();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
