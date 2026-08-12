import React, { useState } from 'react';
import { X, Check, FolderSearch, Loader2, Music, ArrowUpRight } from 'lucide-react';
import { useUsername } from '@/hooks/useUsername';
import logicLogo from '@/assets/logic_logo.png';
import abletonLogo from '@/assets/ableton_live_logo.png';
import flLogo from '@/assets/fl_logo.png';
import reaperLogo from '@/assets/reaper_logo.png';
import protoolsLogo from '@/assets/protools_logo.svg';
import './FoundProjects.css';

// A project the scanner found in a watched folder that isn't imported yet.
// Matches the shape returned by the `scan-watched-for-new-projects` IPC handler.
export interface FoundProject {
  path: string;
  name: string;
  dawType: string;
  primaryFile?: string;
  candidates: string[];
  alreadyImported: boolean;
}

function shortenPath(p: string): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join('/')}`;
}

function dawIcon(daw?: string): string | null {
  if (daw === 'Logic Pro X' || daw === 'Logic Pro') return logicLogo;
  if (daw === 'Ableton Live' || daw === 'Ableton') return abletonLogo;
  if (daw === 'FL Studio') return flLogo;
  if (daw === 'Reaper') return reaperLogo;
  if (daw === 'Pro Tools') return protoolsLogo;
  return null;
}

// ---------------------------------------------------------------------------
// Banner — a dismissible strip in the Library announcing new projects.
// ---------------------------------------------------------------------------

interface BannerProps {
  count: number;
  onReview: () => void;
  onDismiss: () => void;
}

export const FoundProjectsBanner: React.FC<BannerProps> = ({ count, onReview, onDismiss }) => (
  <div className="found-banner" onClick={onReview}>
    <div className="found-banner__icon">
      <FolderSearch size={18} />
    </div>
    <div className="found-banner__info">
      <span className="found-banner__title">
        <strong>{count}</strong> new project{count === 1 ? '' : 's'} found
      </span>
      <span className="found-banner__sub">in your watched folders</span>
    </div>
    <div className="found-banner__review">
      Review
      <ArrowUpRight size={14} />
    </div>
    <button
      className="found-banner__dismiss"
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      aria-label="Dismiss"
    >
      <X size={14} />
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Review panel — modal listing each found project with Add / Ignore.
// ---------------------------------------------------------------------------

interface PanelProps {
  projects: FoundProject[];
  onClose: () => void;
  /** Remove one project from the found list (after it's added or ignored). */
  onRemove: (path: string) => void;
  /** Refresh the Library after a successful add. */
  onAdded: () => void;
}

export const FoundProjectsPanel: React.FC<PanelProps> = ({ projects, onClose, onRemove, onAdded }) => {
  const { username } = useUsername();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const setBusyFor = (path: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(path);
      else next.delete(path);
      return next;
    });

  // Imports a found project, auto-suffixing the display name if one already
  // exists (so a one-click add never fails on a name collision).
  const addWithUniqueName = async (fp: FoundProject) => {
    const storageMode = await window.ipcRenderer
      .invoke('get-default-storage-mode')
      .catch(() => 'home');
    const base = fp.name || 'project';
    for (let attempt = 0; attempt < 25; attempt++) {
      const name = attempt === 0 ? base : `${base} ${attempt + 1}`;
      try {
        await window.ipcRenderer.invoke('init-project', name, fp.path, {
          author: username,
          storageMode,
          primaryFile: fp.primaryFile,
        });
        return;
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (/already exists/i.test(msg)) continue; // try the next suffix
        throw err;
      }
    }
    throw new Error('Could not find an available name for this project');
  };

  const addOne = async (fp: FoundProject) => {
    if (busy.has(fp.path)) return;
    setBusyFor(fp.path, true);
    setError(null);
    try {
      await addWithUniqueName(fp);
      onRemove(fp.path);
      onAdded();
    } catch (err: any) {
      setError(err?.message || 'Failed to add project');
    } finally {
      setBusyFor(fp.path, false);
    }
  };

  const ignoreOne = async (fp: FoundProject) => {
    if (busy.has(fp.path)) return;
    try {
      await window.ipcRenderer.invoke('ignore-found-project', fp.path);
    } catch {
      // Non-fatal — remove it from the list regardless.
    }
    onRemove(fp.path);
  };

  // Sequential so name-collision suffixing stays deterministic.
  const addAll = async () => {
    for (const fp of projects) {
      await addOne(fp);
    }
  };

  return (
    <div className="found-overlay" onClick={onClose}>
      <div className="found-panel" onClick={(e) => e.stopPropagation()}>
        <div className="found-panel__header">
          <div className="found-panel__title">
            <FolderSearch size={18} />
            <span>
              {projects.length} new project{projects.length === 1 ? '' : 's'} found
            </span>
          </div>
          <button className="found-panel__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <p className="found-panel__desc">
          These are in your watched folders but aren't in DAWLab yet. Add the ones you want —
          nothing is added automatically.
        </p>

        {error && <div className="found-panel__error">{error}</div>}

        <ul className="found-list">
          {projects.map((fp) => (
            <li key={fp.path} className="found-row">
              <div className="found-row__icon">
                {dawIcon(fp.dawType) ? (
                  <img src={dawIcon(fp.dawType)!} alt={fp.dawType} />
                ) : (
                  <Music size={16} />
                )}
              </div>
              <div className="found-row__body">
                <span className="found-row__name">{fp.name}</span>
                <span className="found-row__path">{shortenPath(fp.path)}</span>
              </div>
              <span className="found-row__daw">{fp.dawType}</span>
              <div className="found-row__actions">
                <button
                  className="found-btn found-btn--add"
                  onClick={() => addOne(fp)}
                  disabled={busy.has(fp.path)}
                >
                  {busy.has(fp.path) ? (
                    <Loader2 size={14} className="found-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Add
                </button>
                <button
                  className="found-btn found-btn--ignore"
                  onClick={() => ignoreOne(fp)}
                  disabled={busy.has(fp.path)}
                >
                  Ignore
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="found-panel__footer">
          <button className="found-btn found-btn--ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="found-btn found-btn--primary"
            onClick={addAll}
            disabled={busy.size > 0 || projects.length === 0}
          >
            Add all
          </button>
        </div>
      </div>
    </div>
  );
};
