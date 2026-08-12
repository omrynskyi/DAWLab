import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '@/types/library';

/**
 * Owns a single shared <audio> element for auditioning project previews from the
 * Library. Only one project can play at a time — starting a new one stops the
 * previous. Resolves the latest commit's preview into a dawpreview:// URL via IPC.
 */
export function useLibraryPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Mirror the latest requested id so the async toggle can detect being
  // superseded by a newer click while its URL was still resolving.
  const requestedIdRef = useRef<string | null>(null);

  // Lazily create the audio element, clearing playing state when it finishes.
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio();
      el.addEventListener('ended', () => setPlayingId(null));
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  const stop = useCallback(() => {
    requestedIdRef.current = null;
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlayingId(null);
    setLoadingId(null);
  }, []);

  const toggle = useCallback(async (project: Project) => {
    if (!project.hasPreview || !project.latestCommitId || !project.previewFile) return;

    // Clicking the currently-playing project pauses it.
    if (playingId === project.id) {
      stop();
      return;
    }

    const el = getAudio();
    // Switch away from whatever was playing.
    el.pause();
    el.currentTime = 0;

    requestedIdRef.current = project.id;
    try {
      setLoadingId(project.id);
      const url: string = await window.ipcRenderer.invoke(
        'get-preview-url',
        project.name,
        project.latestCommitId,
        project.previewFile,
      );
      // Bail if a newer preview was requested while we were resolving the URL.
      if (requestedIdRef.current !== project.id) return;
      el.src = url;
      await el.play();
      if (requestedIdRef.current !== project.id) return;
      setPlayingId(project.id);
    } catch (err) {
      console.error('[useLibraryPreview] Failed to play preview:', err);
      if (requestedIdRef.current === project.id) setPlayingId(null);
    } finally {
      setLoadingId(prev => (prev === project.id ? null : prev));
    }
  }, [playingId, stop, getAudio]);

  // Tear down the audio element on unmount.
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = '';
      }
    };
  }, []);

  return { playingId, loadingId, toggle, stop };
}
