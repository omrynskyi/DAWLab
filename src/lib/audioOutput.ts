/**
 * Audio output settings shared by every player in the app (Library previews,
 * History preview). Persisted in localStorage — Chromium device IDs are only
 * meaningful to this renderer origin, so they don't belong in the user config.
 *
 * The stored device is a *preference*. Whether it is actually usable is decided
 * at apply time: if the device is gone (unplugged headphones, closed aggregate
 * device) we fall back to the system default and report it, rather than letting
 * playback fail.
 */

export const DEFAULT_DEVICE_ID = 'default';

export interface AudioSettings {
  /** Preferred output device ID, or DEFAULT_DEVICE_ID for the system default. */
  outputDeviceId: string;
  /** Last known label of the preferred device, so Settings can name a missing one. */
  outputDeviceLabel: string;
  /** Preview volume, 0..1. */
  volume: number;
}

export interface OutputDevice {
  deviceId: string;
  label: string;
}

export interface ApplyResult {
  /** True when the preferred device was unavailable and the default was used. */
  fellBack: boolean;
}

const STORAGE_KEY = 'dawlab-audio-settings';

const DEFAULTS: AudioSettings = {
  outputDeviceId: DEFAULT_DEVICE_ID,
  outputDeviceLabel: '',
  volume: 1,
};

type SinkElement = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };

const clampVolume = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULTS.volume;

let cached: AudioSettings | null = null;
const listeners = new Set<(s: AudioSettings) => void>();

export function getAudioSettings(): AudioSettings {
  if (cached) return cached;
  let parsed: Partial<AudioSettings> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw) ?? {};
  } catch {
    // Unreadable or blocked storage → defaults.
  }
  cached = {
    outputDeviceId:
      typeof parsed.outputDeviceId === 'string' && parsed.outputDeviceId
        ? parsed.outputDeviceId
        : DEFAULTS.outputDeviceId,
    outputDeviceLabel: typeof parsed.outputDeviceLabel === 'string' ? parsed.outputDeviceLabel : '',
    volume: clampVolume(parsed.volume),
  };
  return cached;
}

export function updateAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  const next: AudioSettings = { ...getAudioSettings(), ...patch };
  next.volume = clampVolume(next.volume);
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: the setting still applies for this session.
  }
  listeners.forEach((l) => l(next));
  return next;
}

export function subscribeAudioSettings(listener: (s: AudioSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: drop the in-memory cache so the next read hits storage again. */
export function resetAudioSettingsCache(): void {
  cached = null;
}

/** Whether this platform lets us route an <audio> element to a chosen device. */
export function canSelectOutputDevice(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document.createElement('audio') as SinkElement).setSinkId === 'function';
}

/**
 * Lists output devices. Chromium may return blank labels until the page has
 * device permission, so unnamed devices get a stable positional name instead.
 */
export async function listOutputDevices(): Promise<OutputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  const outputs = all.filter((d) => d.kind === 'audiooutput' && d.deviceId !== DEFAULT_DEVICE_ID);
  return outputs.map((d, i) => ({
    deviceId: d.deviceId,
    label: d.label || `Output ${i + 1}`,
  }));
}

/**
 * Apply the current settings to a media element: volume, then output device.
 * Never throws — an unavailable device degrades to the system default.
 */
export async function applyAudioSettings(el: HTMLMediaElement): Promise<ApplyResult> {
  const settings = getAudioSettings();
  el.volume = settings.volume;

  const sink = el as SinkElement;
  if (typeof sink.setSinkId !== 'function') return { fellBack: false };

  const wanted = settings.outputDeviceId === DEFAULT_DEVICE_ID ? '' : settings.outputDeviceId;
  if ((sink.sinkId ?? '') === wanted) return { fellBack: false };

  try {
    await sink.setSinkId(wanted);
    return { fellBack: false };
  } catch (err) {
    console.warn('[audioOutput] Output device unavailable, using system default:', err);
    try {
      await sink.setSinkId('');
    } catch {
      // Default routing failing is outside our control; playback proceeds regardless.
    }
    return { fellBack: wanted !== '' };
  }
}

/**
 * Subscribe to the OS device list changing (headphones unplugged, interface
 * connected). Returns an unsubscribe function.
 */
export function onOutputDevicesChanged(handler: () => void): () => void {
  const md = navigator.mediaDevices;
  if (!md?.addEventListener) return () => {};
  md.addEventListener('devicechange', handler);
  return () => md.removeEventListener('devicechange', handler);
}
