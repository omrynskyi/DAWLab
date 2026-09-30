import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLibraryPreview } from '../useLibraryPreview';
import type { AudioItem } from '@/types/library';

// Minimal controllable stand-in for HTMLAudioElement.
class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  preload = '';
  paused = true;
  ended = false;
  currentTime = 0;
  volume = 1;
  error: { code: number } | null = null;
  loads = 0;
  constructor() {
    super();
    FakeAudio.instances.push(this);
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  load() {
    this.loads++;
  }
  removeAttribute() {}
  fail(code: number) {
    this.error = { code };
    this.paused = true;
    this.dispatchEvent(new Event('error'));
  }
}

const item = { id: 'a1', name: 'Bounce' } as AudioItem;

describe('useLibraryPreview', () => {
  let invoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    invoke = vi.fn().mockResolvedValue('dawpreview://active/x.wav');
    (window as any).ipcRenderer = { ...(window as any).ipcRenderer, invoke };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays, then stops on second toggle', async () => {
    const { result } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.toggleAudio(item); });
    expect(result.current.playingId).toBe('a1');
    await act(async () => { await result.current.toggleAudio(item); });
    expect(result.current.playingId).toBeNull();
  });

  it('play() leaves an already-playing source running instead of stopping it', async () => {
    const { result } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.playAudio(item); });
    expect(result.current.playingId).toBe('a1');
    await act(async () => { await result.current.playAudio(item); });
    expect(result.current.playingId).toBe('a1');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('pause() keeps the position and activeId; play() resumes without rewinding', async () => {
    const { result } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.playAudio(item); });
    const el = FakeAudio.instances[0];
    el.currentTime = 42;

    act(() => result.current.pause());
    expect(result.current.playingId).toBeNull();
    expect(result.current.activeId).toBe('a1');
    expect(el.currentTime).toBe(42);

    await act(async () => { await result.current.playAudio(item); });
    expect(result.current.playingId).toBe('a1');
    expect(el.currentTime).toBe(42);
    expect(invoke).toHaveBeenCalledTimes(1); // same source, no reload
  });

  it('stop() and end-of-track clear activeId', async () => {
    const { result } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.playAudio(item); });
    expect(result.current.activeId).toBe('a1');
    act(() => result.current.stop());
    expect(result.current.activeId).toBeNull();

    await act(async () => { await result.current.playAudio(item); });
    expect(result.current.activeId).toBe('a1');
    act(() => { FakeAudio.instances[0].dispatchEvent(new Event('ended')); });
    expect(result.current.activeId).toBeNull();
  });

  it('seek() moves the playhead', async () => {
    const { result } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.playAudio(item); });
    act(() => result.current.seek(12.5));
    expect(FakeAudio.instances[0].currentTime).toBe(12.5);
  });

  it('reports a missing file instead of playing', async () => {
    invoke.mockResolvedValue(null);
    const { result } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.toggleAudio(item); });
    expect(result.current.playingId).toBeNull();
    expect(result.current.status).toMatchObject({ kind: 'error', canRetry: true });
  });

  it('reloads once on a media error, then surfaces the error with retry', async () => {
    const { result } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.toggleAudio(item); });
    const el = FakeAudio.instances[0];

    act(() => el.fail(2));
    expect(el.loads).toBe(1); // automatic recovery attempt
    expect(result.current.status).toBeNull();

    act(() => el.fail(2));
    expect(result.current.status).toMatchObject({ kind: 'error', canRetry: true });
    expect(result.current.playingId).toBeNull();

    // Retry starts over with a fresh resolve and plays.
    await act(async () => { result.current.retry(); });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.current.playingId).toBe('a1');
    expect(result.current.status).toBeNull();
  });

  it('ignores element errors caused by teardown', async () => {
    const { result, unmount } = renderHook(() => useLibraryPreview());
    await act(async () => { await result.current.toggleAudio(item); });
    const el = FakeAudio.instances[0];
    unmount();
    expect(() => el.fail(4)).not.toThrow();
  });
});
