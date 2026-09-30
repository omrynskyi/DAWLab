import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAudioSettings,
  getAudioSettings,
  resetAudioSettingsCache,
  subscribeAudioSettings,
  updateAudioSettings,
} from '../audioOutput';

const makeEl = (setSinkId?: (id: string) => Promise<void>) =>
  ({ volume: 1, sinkId: '', setSinkId }) as unknown as HTMLMediaElement;

describe('audioOutput settings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAudioSettingsCache();
  });

  it('defaults to the system device at full volume', () => {
    expect(getAudioSettings()).toMatchObject({ outputDeviceId: 'default', volume: 1 });
  });

  it('persists updates, clamps volume, and notifies subscribers', () => {
    const listener = vi.fn();
    const off = subscribeAudioSettings(listener);
    updateAudioSettings({ volume: 4, outputDeviceId: 'abc', outputDeviceLabel: 'Speakers' });
    off();

    expect(listener).toHaveBeenCalledTimes(1);
    resetAudioSettingsCache();
    expect(getAudioSettings()).toEqual({ outputDeviceId: 'abc', outputDeviceLabel: 'Speakers', volume: 1 });
  });

  it('recovers from corrupt stored data', () => {
    localStorage.setItem('dawlab-audio-settings', '{not json');
    expect(getAudioSettings().outputDeviceId).toBe('default');
  });

  it('routes the element to the chosen device and applies volume', async () => {
    updateAudioSettings({ outputDeviceId: 'dev-1', volume: 0.4 });
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    const el = makeEl(setSinkId);

    const result = await applyAudioSettings(el);

    expect(setSinkId).toHaveBeenCalledWith('dev-1');
    expect(el.volume).toBe(0.4);
    expect(result.fellBack).toBe(false);
  });

  it('falls back to the system default when the device is unavailable', async () => {
    updateAudioSettings({ outputDeviceId: 'gone' });
    const setSinkId = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'))
      .mockResolvedValue(undefined);

    const result = await applyAudioSettings(makeEl(setSinkId));

    expect(setSinkId).toHaveBeenLastCalledWith('');
    expect(result.fellBack).toBe(true);
  });

  it('does nothing about devices when setSinkId is unsupported', async () => {
    updateAudioSettings({ outputDeviceId: 'dev-1' });
    expect((await applyAudioSettings(makeEl())).fellBack).toBe(false);
  });
});
