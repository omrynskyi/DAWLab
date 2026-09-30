import React, { useCallback, useEffect, useRef, useState } from 'react';
import './PlaybackBar.css';

interface PlaybackBarProps {
  /** The shared <audio> element; read live so the bar never holds a stale one. */
  getElement: () => HTMLAudioElement | null;
  /** 'inline' is a thin read-only bar for cards; 'panel' is draggable with timestamps. */
  variant?: 'inline' | 'panel';
  onSeek?: (seconds: number) => void;
}

interface Progress {
  time: number;
  duration: number;
}

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const SEEK_STEP_SECONDS = 5;

// Streamed sources can report an unknown (NaN/Infinity) duration; fall back to
// how far the element says it can seek.
const readDuration = (el: HTMLAudioElement): number => {
  if (Number.isFinite(el.duration) && el.duration > 0) return el.duration;
  try {
    if (el.seekable && el.seekable.length > 0) {
      const end = el.seekable.end(el.seekable.length - 1);
      if (Number.isFinite(end)) return end;
    }
  } catch { /* nothing seekable yet */ }
  return 0;
};

/**
 * Progress bar for the Library's shared audio element. Time and duration are
 * read straight off the element (animation-frame polling while it plays, media
 * events otherwise), so the rest of the Library never re-renders as the
 * playhead moves.
 */
export const PlaybackBar: React.FC<PlaybackBarProps> = ({ getElement, variant = 'inline', onSeek }) => {
  const [progress, setProgress] = useState<Progress>({ time: 0, duration: 0 });
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  // Where the pointer is over the track (0..1), for the hover preview.
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = getElement();
    if (!el) return;
    let raf = 0;

    const read = () => {
      const duration = readDuration(el);
      const time = el.currentTime || 0;
      setProgress(prev => (prev.time === time && prev.duration === duration ? prev : { time, duration }));
    };
    const tick = () => {
      read();
      raf = el.paused ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => {
      read();
      if (!raf && !el.paused) raf = requestAnimationFrame(tick);
    };

    const events = ['play', 'playing', 'pause', 'seeked', 'timeupdate', 'durationchange', 'loadedmetadata', 'emptied'];
    events.forEach(name => el.addEventListener(name, kick));
    kick();
    return () => {
      events.forEach(name => el.removeEventListener(name, kick));
      if (raf) cancelAnimationFrame(raf);
    };
  }, [getElement]);

  const ratio = progress.duration > 0 ? Math.min(1, Math.max(0, progress.time / progress.duration)) : 0;

  const ratioAt = useCallback((clientX: number): number | null => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const seekToPointer = useCallback((clientX: number) => {
    const r = ratioAt(clientX);
    // Read the duration live so a click right after metadata loads still works.
    const el = getElement();
    const duration = el ? readDuration(el) : progress.duration;
    if (r == null || !onSeek || duration <= 0) return;
    onSeek(r * duration);
  }, [ratioAt, getElement, onSeek, progress.duration]);

  if (variant === 'inline') {
    return (
      <div className="playback-bar playback-bar--inline" aria-hidden="true">
        <div className="playback-bar__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    );
  }

  return (
    <div className="playback-bar-panel">
      <div
        ref={trackRef}
        className={`playback-bar playback-bar--panel${dragging ? ' playback-bar--dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(progress.duration)}
        aria-valuenow={Math.round(progress.time)}
        aria-valuetext={`${formatTime(progress.time)} of ${formatTime(progress.duration)}`}
        onPointerDown={(e) => {
          draggingRef.current = true;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          setHoverRatio(ratioAt(e.clientX));
          seekToPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          setHoverRatio(ratioAt(e.clientX));
          if (draggingRef.current) seekToPointer(e.clientX);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          setDragging(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => { if (!draggingRef.current) setHoverRatio(null); }}
        onPointerCancel={() => { draggingRef.current = false; setDragging(false); setHoverRatio(null); }}
        onKeyDown={(e) => {
          if (!onSeek) return;
          if (e.key === 'ArrowRight') onSeek(Math.min(progress.duration, progress.time + SEEK_STEP_SECONDS));
          else if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress.time - SEEK_STEP_SECONDS));
          else return;
          e.preventDefault();
        }}
      >
        {hoverRatio != null && progress.duration > 0 && (
          <>
            <div className="playback-bar__hover" style={{ width: `${hoverRatio * 100}%` }} />
            <div className="playback-bar__tooltip" style={{ left: `${hoverRatio * 100}%` }}>
              {formatTime(hoverRatio * progress.duration)}
            </div>
          </>
        )}
        <div className="playback-bar__fill" style={{ width: `${ratio * 100}%` }} />
        <div className="playback-bar__thumb" style={{ left: `${ratio * 100}%` }} />
      </div>
      <div className="playback-bar__times">
        <span>{formatTime(progress.time)}</span>
        <span>{progress.duration > 0 ? `-${formatTime(progress.duration - progress.time)}` : '--:--'}</span>
      </div>
    </div>
  );
};
