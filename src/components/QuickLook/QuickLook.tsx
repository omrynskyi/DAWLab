import React, { useEffect } from 'react';
import { Play, Pause, Loader2, X, GitCommitHorizontal } from 'lucide-react';
import { PlaybackBar } from '@/components/PlaybackBar';
import './QuickLook.css';

export interface QuickLookDetail {
  label: string;
  value: string;
}

interface QuickLookProps {
  title: string;
  /** Artwork: a DAW logo or a generic icon. */
  icon: React.ReactNode;
  /** Short facts under the title, e.g. DAW / BPM / tracks. */
  details: QuickLookDetail[];
  /** The commit the previewed audio belongs to (projects only). */
  commit?: { id: string; message: string | null; date: string | null };
  isPlaying: boolean;
  isLoading: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  getElement: () => HTMLAudioElement | null;
  onClose: () => void;
}

/**
 * macOS Quick Look–style peek at the selected item: artwork, name, commit and a
 * seekable play bar. Closing it (Space, Esc, or clicking away) never stops the
 * audio — playback carries on and the item's card keeps showing its progress bar.
 */
export const QuickLook: React.FC<QuickLookProps> = ({
  title,
  icon,
  details,
  commit,
  isPlaying,
  isLoading,
  onTogglePlay,
  onSeek,
  getElement,
  onClose,
}) => {
  // Escape closes; Space is owned by the Library's window handler so opening and
  // closing share one code path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="quick-look-backdrop" onMouseDown={onClose}>
      <div
        className="quick-look"
        role="dialog"
        aria-label={`Preview of ${title}`}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <button className="quick-look__close" onClick={onClose} aria-label="Close preview">
          <X size={16} />
        </button>

        <div className="quick-look__artwork">{icon}</div>
        <h2 className="quick-look__title" title={title}>{title}</h2>

        {details.length > 0 && (
          <div className="quick-look__details">
            {details.map(d => (
              <span key={d.label} className="quick-look__detail">
                <span className="quick-look__detail-label">{d.label}</span>
                {d.value}
              </span>
            ))}
          </div>
        )}

        {commit && (
          <div className="quick-look__commit">
            <GitCommitHorizontal size={16} className="quick-look__commit-icon" />
            <div className="quick-look__commit-body">
              <span className="quick-look__commit-message">{commit.message || 'No commit message'}</span>
              <span className="quick-look__commit-meta">
                {commit.id.slice(0, 7)}{commit.date ? ` · ${commit.date}` : ''}
              </span>
            </div>
          </div>
        )}

        <div className="quick-look__player">
          <button
            className="quick-look__play"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={20} />
            ) : (
              <Play size={20} />
            )}
          </button>
          <PlaybackBar variant="panel" getElement={getElement} onSeek={onSeek} />
        </div>

        <span className="quick-look__hint">Space to close · keeps playing</span>
      </div>
    </div>
  );
};
