import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, AudioItem } from '@/types/library';
import { applyAudioSettings, onOutputDevicesChanged, subscribeAudioSettings } from '@/lib/audioOutput';

/** What the Library should tell the user about playback, if anything. */
export interface PlaybackStatus {
  kind: 'error' | 'notice';
  text: string;
  /** True when trying again can help (a retry re-resolves and reloads the source). */
  canRetry: boolean;
}

const NOTICE_MS = 5000;

const MEDIA_ERROR_TEXT: Record<number, string> = {
  2: 'The audio stopped loading. Check the file is still available and try again.',
  3: 'This audio file could not be decoded.',
  4: 'This audio file is missing or in a format that can’t be played.',
};

/**
 * Owns a single shared <audio> element for auditioning project previews from the
 * Library. Only one project can play at a time — starting a new one stops the
 * previous. Resolves the latest commit's preview into a dawpreview:// URL via IPC.
 *
 * The UI state (`playingId`) is driven by the <audio> element's OWN events, not by
 * the async play() call. The element is the single source of truth, so the button
 * icon can never drift out of sync with what is actually playing — regardless of
 * rapid clicking, switching projects, or navigating away and back.
 *
 * Failures are recovered once automatically (reload the source and resume where it
 * left off — this is what rescues playback after the app was backgrounded and the
 * browser dropped the connection). If that doesn't work the failure is surfaced
 * through `status` with a Retry action instead of failing silently.
 */
export function useLibraryPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // The source loaded into the element and not yet stopped or finished — playing OR
  // paused. Lets the UI keep a progress bar on a paused item, unlike `playingId`.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackStatus | null>(null);

  // The project whose preview is currently loaded into the element. Read live in
  // toggle so decisions never depend on possibly-stale React state.
  const currentIdRef = useRef<string | null>(null);

  // The source the user last asked to play, or null once they stopped it. Element
  // events for anything else (teardown, superseded loads) are ignored.
  const wantedIdRef = useRef<string | null>(null);
  const lastSourceRef = useRef<{ id: string; resolveUrl: () => Promise<string | null> } | null>(null);

  // Monotonically bumped on every start/stop. An async load that finds the token
  // changed knows it was superseded and bails instead of stomping newer state.
  const tokenRef = useRef(0);
  // Token for which the one automatic recovery attempt was already spent.
  const recoveredTokenRef = useRef(-1);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((text: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setStatus({ kind: 'notice', text, canRetry: false });
    noticeTimerRef.current = setTimeout(() => setStatus(null), NOTICE_MS);
  }, []);

  const showError = useCallback((text: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setStatus({ kind: 'error', text, canRetry: true });
  }, []);

  const dismissStatus = useCallback(() => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setStatus(null);
  }, []);

  // Reload the current source and resume from where it was. Used for the single
  // automatic recovery; a second failure is reported to the user.
  const reloadCurrent = useCallback((el: HTMLAudioElement) => {
    const token = tokenRef.current;
    const resumeAt = el.currentTime;
    const onReady = () => {
      if (token !== tokenRef.current) return; // user moved on
      if (Number.isFinite(resumeAt) && resumeAt > 0) {
        try { el.currentTime = resumeAt; } catch { /* seek not ready; start from 0 */ }
      }
      el.play().catch(() => { /* a persistent failure arrives via the error event */ });
    };
    el.addEventListener('loadedmetadata', onReady, { once: true });
    setLoadingId(currentIdRef.current);
    el.load();
  }, []);

  // Shared by the element's error event and the play() rejection path.
  const handleFailure = useCallback((el: HTMLAudioElement, fallbackText: string) => {
    const id = currentIdRef.current;
    if (!id || wantedIdRef.current !== id) return; // teardown or superseded — ignore
    if (recoveredTokenRef.current !== tokenRef.current) {
      recoveredTokenRef.current = tokenRef.current;
      reloadCurrent(el);
      return;
    }
    setPlayingId(null);
    setLoadingId(null);
    setActiveId(null);
    showError(MEDIA_ERROR_TEXT[el.error?.code ?? 0] ?? fallbackText);
  }, [reloadCurrent, showError]);

  // Lazily create the element and wire UI state to its real playback events.
  const getAudio = useCallback(() => {
    let el = audioRef.current;
    if (!el) {
      const created = new Audio();
      el = created;
      created.preload = 'auto';
      // Events from an element that has since been replaced (unmount/remount) are stale.
      const live = () => audioRef.current === created;
      // Actual playback started/resumed → show stop, drop the spinner.
      created.addEventListener('playing', () => {
        if (!live()) return;
        setPlayingId(currentIdRef.current);
        setLoadingId(null);
      });
      // Data ran dry mid-playback (slow disk, resumed after suspend) → show progress
      // rather than a frozen stop icon.
      created.addEventListener('waiting', () => {
        if (!live() || wantedIdRef.current !== currentIdRef.current) return;
        setLoadingId(currentIdRef.current);
      });
      // play() invoked and element unpaused → reflect immediately for responsiveness.
      created.addEventListener('play', () => { if (live()) setPlayingId(currentIdRef.current); });
      // Paused, finished, or errored → not playing. If play() silently fails the
      // element re-pauses, so this self-corrects a premature stop icon.
      created.addEventListener('pause', () => { if (live()) setPlayingId(null); });
      created.addEventListener('ended', () => {
        if (!live()) return;
        setPlayingId(null);
        setActiveId(null);
      });
      created.addEventListener('error', () => {
        if (!live()) return;
        handleFailure(created, 'Playback failed.');
      });
      audioRef.current = created;
    }
    return el;
  }, [handleFailure]);

  const stop = useCallback(() => {
    tokenRef.current++; // cancel any in-flight load
    wantedIdRef.current = null;
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlayingId(null);
    setLoadingId(null);
    setActiveId(null);
  }, []);

  // Pause in place (no rewind) so the item can be resumed where it left off.
  // Also cancels a load still in flight, which would otherwise start playing later.
  const pause = useCallback(() => {
    tokenRef.current++;
    audioRef.current?.pause();
    setLoadingId(null);
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(seconds)) return;
    try { el.currentTime = Math.max(0, seconds); } catch { /* no source loaded yet */ }
  }, []);

  // Progress bars read time/duration straight off the element instead of routing
  // 60fps updates through React state here.
  const getElement = useCallback(() => audioRef.current, []);

  // Core play/stop toggle for any source, keyed by a stable id. The URL is
  // resolved lazily (only when actually starting a new source) via `resolveUrl`,
  // so the same robust, event-driven state machine serves both project previews
  // and imported audio items through one shared element — only one plays at a time.
  //
  // mode 'toggle' stops (pause + rewind) a playing source. mode 'ensure' never stops:
  // it leaves a playing source alone and resumes a paused one from where it was.
  const toggleSource = useCallback(async (
    id: string,
    resolveUrl: () => Promise<string | null>,
    mode: 'toggle' | 'ensure' = 'toggle',
  ) => {
    const el = getAudio();

    // Decide from the element's LIVE state, not React state — immune to stale
    // closures, batched renders, and clicks that arrive between renders.
    const isCurrent = currentIdRef.current === id;
    const isPlaying = isCurrent && !el.paused && !el.ended;

    if (isPlaying) {
      if (mode === 'ensure') return;
      // Stop (pause + rewind) so the next click plays from the beginning.
      stop();
      return;
    }

    const token = ++tokenRef.current;
    wantedIdRef.current = id;
    lastSourceRef.current = { id, resolveUrl };
    setStatus(null);
    try {
      if (!isCurrent) {
        // Switching sources: stop the old one and load the new src. A fresh src
        // starts at 0, and seeking before it loads would break play(), so we don't
        // touch currentTime here.
        setLoadingId(id);
        el.pause();
        const url = await resolveUrl();
        if (token !== tokenRef.current) return; // superseded while resolving
        if (!url) {
          setLoadingId(null);
          showError('Couldn’t find this audio file. It may have been moved or deleted.');
          return;
        }
        el.src = url;
        currentIdRef.current = id;
        setActiveId(id);
      } else {
        // Same source already loaded (after stop or after it ended): just rewind,
        // unless we're resuming a paused one. Re-assigning the same src would
        // reload and abort the play() below.
        if (mode === 'toggle' || el.ended) el.currentTime = 0;
        setActiveId(id);
      }

      // Route to the chosen output device / volume. Falls back to the system
      // default when the device is gone, and tells the user once.
      const applied = await applyAudioSettings(el);
      if (token !== tokenRef.current) return;
      if (applied.fellBack) showNotice('Selected output device unavailable — playing through the system default.');

      await el.play();
      // If a newer action superseded us while play() was resolving, undo it so the
      // element matches the latest intent. State is corrected by its pause event.
      if (token !== tokenRef.current) {
        el.pause();
      }
      // playingId / loadingId are updated by the element's play/playing events.
    } catch (err) {
      if (token !== tokenRef.current) return;
      console.error('[useLibraryPreview] Failed to play source:', err);
      // Media failures also fire the element's error event, which owns recovery.
      // Anything else (autoplay policy, unexpected rejection) is reported here.
      if (!el.error) {
        setPlayingId(null);
        setLoadingId(null);
        showError('Playback couldn’t start. Try again.');
      }
    }
  }, [getAudio, stop, showError, showNotice]);

  // Play/stop a project's audio preview — the latest commit with one, else the
  // most recent commit that has one (resolved in deriveProjectFacetData).
  const toggle = useCallback((project: Project) => {
    if (!project.hasPreview || !project.previewCommitId || !project.previewFile) return;
    return toggleSource(project.id, () =>
      window.ipcRenderer.invoke(
        'get-preview-url',
        project.name,
        project.previewCommitId,
        project.previewFile,
      ),
    );
  }, [toggleSource]);

  // Play/stop an imported audio item (bounce / reference).
  const toggleAudio = useCallback((item: AudioItem) => {
    return toggleSource(item.id, () => window.ipcRenderer.invoke('get-audio-url', item.id));
  }, [toggleSource]);

  // Start (or resume) without ever stopping — for Space / Quick Look, where a
  // second press must leave the music running.
  const play = useCallback((project: Project) => {
    if (!project.hasPreview || !project.previewCommitId || !project.previewFile) return;
    return toggleSource(project.id, () =>
      window.ipcRenderer.invoke(
        'get-preview-url',
        project.name,
        project.previewCommitId,
        project.previewFile,
      ),
    'ensure');
  }, [toggleSource]);

  const playAudio = useCallback((item: AudioItem) => {
    return toggleSource(item.id, () => window.ipcRenderer.invoke('get-audio-url', item.id), 'ensure');
  }, [toggleSource]);

  // Try the last-requested source again from scratch (fresh URL, fresh load).
  const retry = useCallback(() => {
    const last = lastSourceRef.current;
    if (!last) return;
    currentIdRef.current = null; // force the "new source" path
    void toggleSource(last.id, last.resolveUrl);
  }, [toggleSource]);

  // Keep the element in step with Settings changes and with devices coming and going.
  useEffect(() => {
    const reapply = () => {
      const el = audioRef.current;
      if (!el) return;
      applyAudioSettings(el).then((r) => {
        if (r.fellBack) showNotice('Selected output device unavailable — using the system default.');
      });
    };
    const offSettings = subscribeAudioSettings(reapply);
    const offDevices = onOutputDevicesChanged(reapply);

    // Returning to the app is when a suspended element is most likely to have
    // died. If it errored while hidden, recover instead of leaving a dead button.
    const onVisible = () => {
      const el = audioRef.current;
      if (document.visibilityState !== 'visible' || !el) return;
      if (el.error && wantedIdRef.current && wantedIdRef.current === currentIdRef.current) {
        handleFailure(el, 'Playback failed.');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offSettings();
      offDevices();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [handleFailure, showNotice]);

  // Tear down the audio element on unmount and forget it, so a remount (including
  // React StrictMode's dev double-mount) starts from a clean element instead of one
  // that "remembers" a source it no longer has.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      audioRef.current = null;
      currentIdRef.current = null;
      wantedIdRef.current = null;
      // Not a DOM ref: we want the live counter so in-flight loads are cancelled.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      tokenRef.current++;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    };
  }, []);

  return {
    playingId, loadingId, activeId, status, dismissStatus, retry,
    toggle, toggleAudio, play, playAudio, pause, seek, getElement, stop,
  };
}
