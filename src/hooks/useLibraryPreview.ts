import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, AudioItem } from '@/types/library';

/**
 * Owns a single shared <audio> element for auditioning project previews from the
 * Library. Only one project can play at a time — starting a new one stops the
 * previous. Resolves the latest commit's preview into a dawpreview:// URL via IPC.
 *
 * The UI state (`playingId`) is driven by the <audio> element's OWN events, not by
 * the async play() call. The element is the single source of truth, so the button
 * icon can never drift out of sync with what is actually playing — regardless of
 * rapid clicking, switching projects, or navigating away and back.
 */
export function useLibraryPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // The project whose preview is currently loaded into the element. Read live in
  // toggle so decisions never depend on possibly-stale React state.
  const currentIdRef = useRef<string | null>(null);

  // Monotonically bumped on every start/stop. An async load that finds the token
  // changed knows it was superseded and bails instead of stomping newer state.
  const tokenRef = useRef(0);

  // Lazily create the element and wire UI state to its real playback events.
  const getAudio = useCallback(() => {
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      // Actual playback started/resumed → show stop, drop the spinner.
      el.addEventListener('playing', () => {
        setPlayingId(currentIdRef.current);
        setLoadingId(null);
      });
      // play() invoked and element unpaused → reflect immediately for responsiveness.
      el.addEventListener('play', () => setPlayingId(currentIdRef.current));
      // Paused, finished, or errored → not playing. If play() silently fails the
      // element re-pauses, so this self-corrects a premature stop icon.
      el.addEventListener('pause', () => setPlayingId(null));
      el.addEventListener('ended', () => setPlayingId(null));
      el.addEventListener('error', () => {
        setPlayingId(null);
        setLoadingId(null);
      });
      audioRef.current = el;
    }
    return el;
  }, []);

  const stop = useCallback(() => {
    tokenRef.current++; // cancel any in-flight load
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlayingId(null);
    setLoadingId(null);
  }, []);

  // Core play/stop toggle for any source, keyed by a stable id. The URL is
  // resolved lazily (only when actually starting a new source) via `resolveUrl`,
  // so the same robust, event-driven state machine serves both project previews
  // and imported audio items through one shared element — only one plays at a time.
  const toggleSource = useCallback(async (id: string, resolveUrl: () => Promise<string>) => {
    const el = getAudio();

    // Decide from the element's LIVE state, not React state — immune to stale
    // closures, batched renders, and clicks that arrive between renders.
    const isCurrent = currentIdRef.current === id;
    const isPlaying = isCurrent && !el.paused && !el.ended;

    if (isPlaying) {
      // Stop (pause + rewind) so the next click plays from the beginning.
      stop();
      return;
    }

    const token = ++tokenRef.current;
    try {
      if (!isCurrent) {
        // Switching sources: stop the old one and load the new src. A fresh src
        // starts at 0, and seeking before it loads would break play(), so we don't
        // touch currentTime here.
        setLoadingId(id);
        el.pause();
        const url = await resolveUrl();
        if (token !== tokenRef.current) return; // superseded while resolving
        el.src = url;
        currentIdRef.current = id;
      } else {
        // Same source already loaded (after stop or after it ended): just rewind.
        // Re-assigning the same src would reload and abort the play() below.
        el.currentTime = 0;
      }

      await el.play();
      // If a newer action superseded us while play() was resolving, undo it so the
      // element matches the latest intent. State is corrected by its pause event.
      if (token !== tokenRef.current) {
        el.pause();
      }
      // playingId / loadingId are updated by the element's play/playing events.
    } catch (err) {
      if (token === tokenRef.current) {
        console.error('[useLibraryPreview] Failed to play source:', err);
        setPlayingId(null);
        setLoadingId(null);
      }
    }
  }, [getAudio, stop]);

  // Play/stop a project's latest-commit audio preview.
  const toggle = useCallback((project: Project) => {
    if (!project.hasPreview || !project.latestCommitId || !project.previewFile) return;
    return toggleSource(project.id, () =>
      window.ipcRenderer.invoke(
        'get-preview-url',
        project.name,
        project.latestCommitId,
        project.previewFile,
      ),
    );
  }, [toggleSource]);

  // Play/stop an imported audio item (bounce / reference).
  const toggleAudio = useCallback((item: AudioItem) => {
    return toggleSource(item.id, () => window.ipcRenderer.invoke('get-audio-url', item.id));
  }, [toggleSource]);

  // Tear down the audio element on unmount. The hook's refs are discarded with the
  // instance, so a remount always starts from a clean element and empty state.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = '';
      }
    };
  }, []);

  return { playingId, loadingId, toggle, toggleAudio, stop };
}
