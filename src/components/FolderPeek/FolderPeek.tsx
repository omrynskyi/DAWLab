import React, { useLayoutEffect, useRef, useState } from 'react';
import { Music, FolderOpen, AudioLines } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import type { Project, Folder, AudioItem } from '@/types/library';
import './FolderPeek.css';

interface FolderPeekProps {
  folder: Folder;
  /** Direct child projects of this folder. */
  projects: Project[];
  /** Direct child subfolders of this folder. */
  subfolders: Folder[];
  /** Direct child audio items (bounces / references) of this folder. */
  audioItems?: AudioItem[];
  /** Resolve a DAW name to its logo asset (null → generic icon). */
  getIcon: (daw?: string) => string | null;
  /** Bounding rect of the folder tile that was clicked, used to position the peek. */
  anchorRect: DOMRect;
  onOpenProject: (id: string, name: string) => void;
  onEnterFolder: (id: string) => void;
  onEnterSubfolder: (id: string) => void;
  /** Audition an audio item in place (optional). */
  onPlayAudio?: (item: AudioItem) => void;
  onClose: () => void;
}

const MAX_PEEK_ITEMS = 9;

/**
 * iOS-style folder peek: clicking a folder expands it in place into a small
 * panel showing up to 9 of its contents, letting you jump straight to a project
 * or enter the folder — without leaving the library grid.
 */
export const FolderPeek: React.FC<FolderPeekProps> = ({
  folder,
  projects,
  subfolders,
  audioItems = [],
  getIcon,
  anchorRect,
  onOpenProject,
  onEnterFolder,
  onEnterSubfolder,
  onPlayAudio,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useClickOutside(panelRef, onClose, true);

  // Position the panel centred over the folder tile, clamped to the viewport.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const { width, height } = panel.getBoundingClientRect();
    const margin = 12;
    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    let top = anchorRect.top + anchorRect.height / 2 - height / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
    setPos({ left, top });
  }, [anchorRect]);

  // Subfolders first, then projects, then audio, capped at 9 (iOS shows 9 on the second page).
  const folderItems = subfolders.map(f => ({ kind: 'folder' as const, item: f }));
  const projectItems = projects.map(p => ({ kind: 'project' as const, item: p }));
  const audioItemsList = audioItems.map(a => ({ kind: 'audio' as const, item: a }));
  const items = [...folderItems, ...projectItems, ...audioItemsList].slice(0, MAX_PEEK_ITEMS);
  const overflow = subfolders.length + projects.length + audioItems.length - items.length;
  const isEmpty = items.length === 0;

  return (
    <div
      ref={panelRef}
      className="folder-peek"
      style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { visibility: 'hidden' }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="folder-peek-header">
        <span className="folder-peek-name">{folder.name}</span>
        <button
          className="folder-peek-open"
          onClick={() => onEnterFolder(folder.id)}
        >
          <FolderOpen size={14} />
          Open
        </button>
      </div>

      {isEmpty ? (
        <div className="folder-peek-empty">This folder is empty</div>
      ) : (
        <div className="folder-peek-grid">
          {items.map(({ kind, item }) =>
            kind === 'folder' ? (
              <button
                key={`f-${item.id}`}
                className="folder-peek-item"
                onDoubleClick={() => onEnterSubfolder(item.id)}
                onClick={() => onEnterSubfolder(item.id)}
                title={item.name}
              >
                <span className="folder-peek-item-icon folder-peek-item-subfolder">
                  <FolderOpen size={22} />
                </span>
                <span className="folder-peek-item-name">{item.name}</span>
              </button>
            ) : kind === 'audio' ? (
              <button
                key={`a-${item.id}`}
                className="folder-peek-item"
                onClick={() => onPlayAudio?.(item)}
                title={item.name}
              >
                <span className="folder-peek-item-icon">
                  <AudioLines size={22} />
                </span>
                <span className="folder-peek-item-name">{item.name}</span>
              </button>
            ) : (
              <button
                key={`p-${item.id}`}
                className="folder-peek-item"
                onClick={() => onOpenProject(item.id, item.name)}
                title={item.name}
              >
                <span className="folder-peek-item-icon">
                  {getIcon(item.daw) ? (
                    <img src={getIcon(item.daw)!} alt={item.daw} />
                  ) : (
                    <Music size={22} />
                  )}
                </span>
                <span className="folder-peek-item-name">{item.name}</span>
              </button>
            )
          )}
          {overflow > 0 && (
            <button className="folder-peek-item folder-peek-more" onClick={() => onEnterFolder(folder.id)}>
              <span className="folder-peek-item-icon">+{overflow}</span>
              <span className="folder-peek-item-name">more</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
