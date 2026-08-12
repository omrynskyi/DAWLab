import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Library.css';
import { Plus, FolderPlus, Search, LayoutGrid, List, Music, User, Loader2, ArrowUpRight, FileMusic, Filter, X, Play, Square } from 'lucide-react';
import logo from '../../assets/logo.png';
import logicLogo from '@/assets/logic_logo.png';
import abletonLogo from '@/assets/ableton_live_logo.png';
import flLogo from '@/assets/fl_logo.png';
import reaperLogo from '@/assets/reaper_logo.png';
import protoolsLogo from '@/assets/protools_logo.svg';
import { useClickOutside } from '@/hooks/useClickOutside';
import { ContextMenu, createFolderMenuItems } from '@/components/ContextMenu';
import type { ContextMenuItem } from '@/components/ContextMenu';
import { InputModal } from '@/components/InputModal';
import { NewProject } from '@/components/NewProject';
import type { DawType } from '@/components/NewProject/NewProject';
import { WarningModal, shouldSkipWarning } from '@/components/WarningModal/WarningModal';
import { ActivityPanel } from '@/components/ActivityPanel';
import { TagChip } from '@/components/ui/TagChip';
import { TagManagerPopover } from '@/components/TagManagerPopover/TagManagerPopover';
import { Tag } from 'lucide-react';

import type { Project, Folder } from '@/types/library';
import {
  collectFacets,
  projectMatchesFacets,
  facetKey,
  facetColor,
  FACET_GROUP_LABELS,
} from '@/lib/facets';
import type { Facet } from '@/lib/facets';
import { useLibraryPreview } from '@/hooks/useLibraryPreview';
import { FolderPeek } from '@/components/FolderPeek';
import { DitherGradient, EMPTY_LIBRARY_DITHER } from '@/components/ui/DitherGradient';

// Maps the DAW label returned by the main-process `detect-daw` handler to the
// DAW id the NewProject form uses to prefill its walkthrough/selection.
const DAW_LABEL_TO_TYPE: Record<string, DawType> = {
  'Logic Pro X': 'logic',
  'Logic Pro': 'logic',
  'Ableton Live': 'ableton',
  'Ableton': 'ableton',
  'FL Studio': 'fl',
  'Reaper': 'reaper',
  'Pro Tools': 'protools',
};

// Default project name from a dropped path: the folder/file basename with any
// known DAW project extension stripped ("Song.flp" -> "Song").
const deriveProjectName = (p: string): string => {
  const base = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
  return base.replace(/\.(logicx|flp|als|rpp|ptx)$/i, '');
};

export const Library: React.FC = () => {
  // ----------- Hooks & State -----------
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('dawlab-library-view-mode') as 'grid' | 'list') || 'grid';
  });

  useEffect(() => {
    localStorage.setItem('dawlab-library-view-mode', viewMode);
  }, [viewMode]);

  // Data State
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const rawProjectsRef = useRef<any[]>([]);


  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Navigation State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'folder' | 'empty' | 'project'; folderId?: string; projectId?: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Tag Manager Popover State
  const [tagPopover, setTagPopover] = useState<{ x: number; y: number; projectId: string } | null>(null);

  // Folder peek (iOS-style): single click opens an in-place preview; double click enters.
  const [peek, setPeek] = useState<{ folderId: string; rect: DOMRect } | null>(null);
  const folderClickTimer = useRef<number | null>(null);

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState<{ type: 'project' | 'folder'; id: string } | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // OS file drag-and-drop: dropping a folder/file from Finder onto the library
  // creates a project from it if it's a valid DAW project.
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dropErrorTimer = useRef<number | null>(null);
  // When a valid project is dropped, the NewProject modal opens prefilled with
  // this; folderId records which folder it was dropped into so it lands there.
  const [dropInit, setDropInit] = useState<{ path: string; name: string; daw: DawType; folderId: string | null } | null>(null);

  // Unified ordered list for rendering (enables free-form reordering)
  const [viewOrder, setViewOrder] = useState<Array<{ kind: 'folder' | 'project'; id: string }>>([]);

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [folderToRename, setFolderToRename] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // Recently Saved State
  const [recentlySavedProject, setRecentlySavedProject] = useState<{
    id: string;
    name: string;
    path: string;
    daw?: string;
    latestModTime?: string;
  } | null>(null);
  const [recentlySavedDismissed, setRecentlySavedDismissed] = useState(false);

  useEffect(() => {
    setRecentlySavedDismissed(false);
  }, [recentlySavedProject?.id, recentlySavedProject?.latestModTime]);

  const HANDLED_MOD_TIMES_KEY = 'dawlab-handled-mod-times';
  const [handledModTimes, setHandledModTimes] = useState<Map<string, string>>(() => {
    const stored = localStorage.getItem(HANDLED_MOD_TIMES_KEY);
    if (stored) {
      try {
        return new Map(JSON.parse(stored));
      } catch {
        return new Map();
      }
    }
    return new Map();
  });

  // Persist handled mod times
  useEffect(() => {
    localStorage.setItem(HANDLED_MOD_TIMES_KEY, JSON.stringify([...handledModTimes]));
  }, [handledModTimes]);

  // Inline audio preview (single shared player, one project at a time)
  const { playingId, loadingId, toggle: togglePreview, stop: stopPreview } = useLibraryPreview();

  // Tag state
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  // Active filter selection, stored as facet keys ("type::value"). OR within a
  // facet type, AND across types — see @/lib/facets.
  const [activeFacets, setActiveFacets] = useState<Set<string>>(new Set());

  useEffect(() => {
    window.ipcRenderer.invoke('load-tag-colors').then((colors: Record<string, string>) => {
      setTagColors(colors || {});
    }).catch(() => {});
  }, []);

  // =======================
  // Loading Data
  // =======================

  const loadMyProjects = async () => {
    try {
      const ipcFolders = await window.ipcRenderer.invoke('get-folders');
      setFolders((ipcFolders || []).sort((a: Folder, b: Folder) => a.position - b.position));

      const projectFolderMap = await window.ipcRenderer.invoke('get-project-folder-map');
      const folderMap = new Map<string, string | null>(
        Object.entries(projectFolderMap).map(([k, v]) => [k, v as string | null])
      );

      const response = await window.ipcRenderer.invoke('get-all-projects');
      const dawvcsProjects = response.projects || response;
      rawProjectsRef.current = dawvcsProjects;

      // Per-project facet metadata (BPM, plugins, track count, preview availability),
      // keyed by project_id. Loaded alongside projects so cards can render auto-facets.
      const facetMap: Record<string, {
        bpm: number | null;
        plugins: Array<{ name: string; is_instrument?: boolean }>;
        trackCount: number | null;
        hasPreview: boolean;
        latestCommitId: string | null;
        previewFile: string | null;
      }> = await window.ipcRenderer.invoke('get-project-facets').catch(() => ({}));

      const convertedProjects: Project[] = dawvcsProjects.map((p: any, index: number) => {
        const pid = String(p.project_id);
        const facets = facetMap[pid];
        return {
          id: pid,
          name: p.name,
          description: p.description || 'No description',
          daw: p.daw || 'Unknown',
          privacy_flag: p.privacy_flag,
          bpm: facets?.bpm ?? p.bpm ?? null,
          genre: p.genre || 'Unknown',
          created_at: new Date().toISOString(),
          folderId: folderMap.get(pid) || null,
          position: index,
          tags: p.tags || [],
          plugins: facets?.plugins ?? [],
          trackCount: facets?.trackCount ?? null,
          hasPreview: facets?.hasPreview ?? false,
          latestCommitId: facets?.latestCommitId ?? null,
          previewFile: facets?.previewFile ?? null,
        };
      });
      setProjects(convertedProjects);
    } catch (err) {
      console.error('[Library] Error loading projects:', err);
    }
  };

  // Initial Load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadMyProjects();
      setLoading(false);
      checkRecentlySaved();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recently Saved Check
  const checkRecentlySaved = useCallback(async () => {
    try {
      const allProjects = rawProjectsRef.current;
      if (!allProjects || allProjects.length === 0) return;

      for (const p of allProjects) {
        if (!p.path || p.path === 'NA') continue;
        const result = await window.ipcRenderer.invoke('check-project-modified', p.path, 5);

        if (result.modified && result.latestModTime) {
          const projectId = p.project_id ?? `local:${p.name}`;
          const lastHandled = handledModTimes.get(projectId);
          if (!lastHandled || result.latestModTime > lastHandled) {
            setRecentlySavedProject({
              id: projectId,
              name: p.name,
              path: p.path,
              daw: p.daw,
              latestModTime: result.latestModTime,
            });
            return;
          }
        }
      }
      setRecentlySavedProject(null);
    } catch (err) {
      console.error('Error checking recently saved:', err);
    }
  }, [handledModTimes]);

  // Window Focus
  useEffect(() => {
    const handleFocus = () => checkRecentlySaved();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [checkRecentlySaved]);

  useClickOutside(contextMenuRef, useCallback(() => setContextMenu(null), []), !!contextMenu);
  useClickOutside(addMenuRef, useCallback(() => setShowAddMenu(false), []), showAddMenu);
  useClickOutside(filterMenuRef, useCallback(() => setShowFilterMenu(false), []), showFilterMenu);

  // =======================
  // Helper Functions
  // =======================

  const navigateToFolder = (folderId: string | null) => setCurrentFolderId(folderId);

  // Stop any playing preview when the visible folder changes.
  useEffect(() => { stopPreview(); }, [currentFolderId, stopPreview]);

  const enterFolder = useCallback((folderId: string) => {
    if (folderClickTimer.current) {
      window.clearTimeout(folderClickTimer.current);
      folderClickTimer.current = null;
    }
    setPeek(null);
    setCurrentFolderId(folderId);
  }, []);

  // Single click opens the peek after a short delay; a double click cancels it and
  // enters the folder outright (iOS-style disambiguation).
  const handleFolderClick = useCallback((e: React.MouseEvent, folderId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (folderClickTimer.current) window.clearTimeout(folderClickTimer.current);
    folderClickTimer.current = window.setTimeout(() => {
      folderClickTimer.current = null;
      setPeek({ folderId, rect });
    }, 220);
  }, []);

  // Clean up a pending peek timer on unmount.
  useEffect(() => () => {
    if (folderClickTimer.current) window.clearTimeout(folderClickTimer.current);
  }, []);

  const getBreadcrumbsArray = (): Array<{ id: string | null; name: string }> => {
    const breadcrumbs: Array<{ id: string | null; name: string }> = [
      { id: null, name: 'My Files' }
    ];
    if (currentFolderId) {
       const folder = folders.find(f => f.id === currentFolderId);
       if(folder) {
         const path: Folder[] = [folder];
         let parentId = folder.parentId;
         while(parentId) {
           const parent = folders.find(f => f.id === parentId);
           if(parent) {
             path.unshift(parent);
             parentId = parent.parentId;
           } else break;
         }
         path.forEach(f => breadcrumbs.push({ id: f.id, name: f.name }));
       }
    }
    return breadcrumbs;
  };

  // Short DAW label for the compact card meta line.
  const shortDaw = (daw?: string): string => {
    if (!daw || daw === 'Unknown') return '';
    if (daw.startsWith('Logic')) return 'Logic';
    if (daw.startsWith('Ableton')) return 'Ableton';
    return daw;
  };

  // Compact one-line summary of a project's key facets for the card.
  const projectMetaLine = (p: Project): string => {
    const parts: string[] = [];
    const daw = shortDaw(p.daw);
    if (daw) parts.push(daw);
    if (p.bpm != null && p.bpm > 0) parts.push(`${Math.round(p.bpm)} BPM`);
    if (p.trackCount != null && p.trackCount > 0) parts.push(`${p.trackCount} tracks`);
    return parts.length ? parts.join(' · ') : `${p.daw} Project`;
  };

  const getProjectIcon = (daw?: string) => {
    if (daw === 'Logic Pro X' || daw === 'Logic Pro') return logicLogo;
    if (daw === 'Ableton Live' || daw === 'Ableton') return abletonLogo;
    if (daw === 'FL Studio') return flLogo;
    if (daw === 'Reaper') return reaperLogo;
    if (daw === 'Pro Tools') return protoolsLogo;
    return null;
  };

  const openProject = (id: string, name: string) => {
    navigate(`/history/${id}`, { state: { projectName: name } });
  };

  const openRecentlySaved = () => {
    if (recentlySavedProject) {
      if (recentlySavedProject.latestModTime) {
         setHandledModTimes(prev => new Map(prev).set(recentlySavedProject.id, recentlySavedProject.latestModTime!));
      }
      openProject(recentlySavedProject.id, recentlySavedProject.name);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      expanded: true,
      position: folders.length,
      parentId: currentFolderId,
    };

    const updated = [...folders, newFolder];
    setFolders(updated);
    window.ipcRenderer.invoke('save-folders', updated);
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'folder', folderId });
  };

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    // Only show if the click target is the content area itself, not a child item
    const target = e.target as HTMLElement;
    if (target.closest('.library-item') || target.closest('.list-row') || target.closest('.recently-saved-card')) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'empty' });
  };

  const handleProjectContextMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'project', projectId });
  };

  const handleTagPopoverAdd = (projectId: string, tag: string, color: string) => {
    // Deduplicate
    const project = projects.find(p => p.id === projectId);
    if (!project || (project.tags || []).includes(tag)) return;

    // Optimistic update
    const updater = (prev: Project[]) => prev.map(p => p.id === projectId ? { ...p, tags: [...(p.tags || []), tag] } : p);
    setProjects(updater);

    if (color && color !== '#007bff') {
      setTagColors(prev => ({ ...prev, [tag]: color }));
      window.ipcRenderer.invoke('save-tag-color', tag, color).catch(() => {});
    }

    window.ipcRenderer.invoke('add-tag-to-project', projectId, tag).catch(() => {
      // Revert on failure
      const revert = (prev: Project[]) => prev.map(p => p.id === projectId ? { ...p, tags: (p.tags || []).filter(t => t !== tag) } : p);
      setProjects(revert);
    });
  };

  const handleTagPopoverRemove = (projectId: string, tag: string) => {
    // Optimistic update
    const updater = (prev: Project[]) => prev.map(p => p.id === projectId ? { ...p, tags: (p.tags || []).filter(t => t !== tag) } : p);
    setProjects(updater);

    window.ipcRenderer.invoke('delete-tag-from-project', projectId, tag).catch(() => {
      // Revert on failure
      const revert = (prev: Project[]) => prev.map(p => p.id === projectId ? { ...p, tags: [...(p.tags || []), tag] } : p);
      setProjects(revert);
    });
  };

  // =======================
  // Drag and Drop Handlers
  // =======================

  const handleDragStart = (e: React.DragEvent, type: 'project' | 'folder', id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'move';
  };

  const isDescendant = (potentialDescendantId: string, ancestorId: string): boolean => {
    let current = folders.find(f => f.id === potentialDescendantId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = folders.find(f => f.id === current!.parentId);
    }
    return false;
  };

  const handleDragEnterItem = (targetId: string, targetKind: 'folder' | 'project') => {
    if (!draggedItem) return;
    if (draggedItem.id === targetId && draggedItem.type === targetKind) return;
    if (targetKind === 'folder') {
      // Show "drop into folder" indicator instead of reordering
      setDragOverFolderId(targetId as string);
      return;
    }
    setDragOverFolderId(null);
    setViewOrder(prev => {
      const draggedIdx = prev.findIndex(item => item.id === draggedItem.id && item.kind === draggedItem.type);
      const targetIdx = prev.findIndex(item => item.id === targetId && item.kind === targetKind);
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      const result = [...prev];
      result.splice(draggedIdx, 1);
      // After removal, recalculate target index; insert after target if coming from before it
      const newTargetIdx = result.findIndex(item => item.id === targetId && item.kind === targetKind);
      const insertAt = draggedIdx < targetIdx ? newTargetIdx + 1 : newTargetIdx;
      result.splice(insertAt, 0, { kind: draggedItem.type, id: draggedItem.id });
      return result;
    });
  };

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDragOverFolderId(null);
    if (!draggedItem) { setDraggedItem(null); return; }
    // Don't move a folder into itself or its descendant
    if (draggedItem.type === 'folder' && (draggedItem.id === targetFolderId || isDescendant(targetFolderId, draggedItem.id as string))) {
      setDraggedItem(null);
      return;
    }
    if (draggedItem.type === 'project') {
      setProjects(prev => prev.map(p => p.id === draggedItem.id ? { ...p, folderId: targetFolderId } : p));
      window.ipcRenderer.invoke('move-project-to-folder', draggedItem.id, targetFolderId);
    } else {
      setFolders(prev => prev.map(f => f.id === draggedItem.id ? { ...f, parentId: targetFolderId } : f));
      window.ipcRenderer.invoke('move-folder', draggedItem.id, targetFolderId);
    }
    // Remove from current viewOrder since it moved to a different folder context
    setViewOrder(prev => prev.filter(item => !(item.id === draggedItem.id && item.kind === draggedItem.type)));
    setDraggedItem(null);
  };

  const saveViewOrder = () => {
    const key = `dawlab-order-my-projects-${currentFolderId ?? 'root'}`;
    localStorage.setItem(key, JSON.stringify(viewOrder.map(item => `${item.kind}:${String(item.id)}`)));

    const updatedFolders = folders.map(f => {
      const idx = viewOrder.findIndex(item => item.kind === 'folder' && item.id === f.id);
      return idx >= 0 ? { ...f, position: idx } : f;
    });
    setFolders(updatedFolders);
    window.ipcRenderer.invoke('save-folders', updatedFolders);

    setProjects(prev => prev.map(p => {
      const idx = viewOrder.findIndex(item => item.kind === 'project' && item.id === p.id);
      return idx >= 0 ? { ...p, position: idx } : p;
    }));
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverFolderId(null);
  };

  // =======================
  // OS File Drop → New Project
  // =======================

  // True when the drag originates from the OS (a file/folder from Finder) rather
  // than an internal project/folder reorder. Browsers don't expose the dropped
  // item's name or path during hover (the drag data store is protected until
  // drop), so validity can only be checked once the item is actually dropped.
  const isOsFileDrag = (e: React.DragEvent): boolean => {
    if (draggedItem) return false;
    const types = e.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  };

  const flashDropError = (message: string) => {
    setDropError(message);
    if (dropErrorTimer.current) window.clearTimeout(dropErrorTimer.current);
    dropErrorTimer.current = window.setTimeout(() => setDropError(null), 2800);
  };

  useEffect(() => () => {
    if (dropErrorTimer.current) window.clearTimeout(dropErrorTimer.current);
  }, []);

  const handleFileDragEnter = (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    setDropError(null);
    setIsFileDragging(true);
  };

  const handleFileDragOver = (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isFileDragging) setIsFileDragging(true);
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    // relatedTarget is null only when the pointer leaves the window entirely;
    // moving between child elements keeps the overlay up.
    if (e.relatedTarget === null) setIsFileDragging(false);
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    setIsFileDragging(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const droppedPath = window.electronAPI?.getPathForFile?.(files[0]);
    if (!droppedPath) {
      flashDropError('Could not read the dropped item');
      return;
    }

    let result: { daw?: string; isValid?: boolean } | undefined;
    try {
      result = await window.ipcRenderer.invoke('detect-daw', droppedPath);
    } catch (err) {
      console.error('[Library] detect-daw failed for dropped item:', err);
      flashDropError('Could not read the dropped item');
      return;
    }

    if (!result?.isValid) {
      flashDropError('Not a DAW project');
      return;
    }

    setDropInit({
      path: droppedPath,
      name: deriveProjectName(droppedPath),
      daw: DAW_LABEL_TO_TYPE[result.daw || ''] ?? 'logic',
      folderId: currentFolderId,
    });
    setShowNewProjectModal(true);
  };

  // =======================
  // Folder Rename / Delete
  // =======================

  const initiateRename = () => {
    if (!contextMenu?.folderId) return;
    const folder = folders.find(f => f.id === contextMenu.folderId);
    if (folder) {
      setFolderToRename(folder);
      setRenameValue(folder.name);
      setShowRenameModal(true);
    }
  };

  const handleRenameSubmit = () => {
    if (!folderToRename || !renameValue.trim()) return;
    const updated = folders.map(f => f.id === folderToRename.id ? { ...f, name: renameValue.trim() } : f);
    setFolders(updated);
    window.ipcRenderer.invoke('save-folders', updated);
    setShowRenameModal(false);
    setFolderToRename(null);
    setRenameValue('');
  };

  const initiateDelete = async () => {
    if (!contextMenu?.folderId) return;
    const folderId = contextMenu.folderId;
    const folder = folders.find(f => f.id === folderId);
    const hasProjects = projects.some(p => p.folderId === folderId);
    const hasSubfolders = folders.some(f => f.parentId === folderId);
    if (hasProjects || hasSubfolders) {
      alert('Cannot delete folder that contains items. Move or delete its contents first.');
      return;
    }
    if (folder) {
      const skip = await shouldSkipWarning('delete-folder');
      if (skip) { handleConfirmDelete(folder.id); }
      else { setFolderToDelete(folder); setShowDeleteConfirm(true); }
    }
  };

  const handleConfirmDelete = (folderIdOverride?: string) => {
    const id = folderIdOverride || folderToDelete?.id;
    if (!id) return;
    setFolders(prev => prev.filter(f => f.id !== id));
    window.ipcRenderer.invoke('delete-folder', id);
    setShowDeleteConfirm(false);
    setFolderToDelete(null);
  };

  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];
    if (contextMenu.type === 'folder') {
      return createFolderMenuItems(
        () => { initiateRename(); setContextMenu(null); },
        () => { initiateDelete(); setContextMenu(null); }
      );
    }
    if (contextMenu.type === 'project') {
      return [
        {
          label: 'Manage Tags',
          icon: <Tag size={14} />,
          onClick: () => {
            setTagPopover({ x: contextMenu.x, y: contextMenu.y, projectId: contextMenu.projectId! });
            setContextMenu(null);
          },
        },
      ];
    }
    // empty space context menu
    return [
      { label: 'New Project', icon: <FileMusic size={14} />, onClick: () => { setShowNewProjectModal(true); setContextMenu(null); } },
      { label: 'New Folder', icon: <FolderPlus size={14} />, onClick: () => { setShowNewFolderModal(true); setContextMenu(null); } },
    ];
  };

  const currentListFolders = folders.filter(f => f.parentId === currentFolderId);
  const currentListProjects = projects.filter(p => p.folderId === currentFolderId);
  const isLibraryEmpty = !loading && currentListFolders.length === 0 && currentListProjects.length === 0;

  // All facets across visible projects, grouped by type (for the filter panel).
  const visibleFacetGroups = useMemo(
    () => collectFacets(currentListProjects),
    [currentListProjects]
  );

  // Projects filtered by the active facet selection (OR within a type, AND across types).
  const normalizedQuery = searchQuery.trim().toLowerCase();

  // While searching, look across the whole library (into every folder); otherwise
  // stay scoped to the current folder.
  const facetFilteredProjects = useMemo(() => {
    const base = normalizedQuery ? projects : currentListProjects;
    if (activeFacets.size === 0) return base;
    return base.filter(p => projectMatchesFacets(p, activeFacets));
  }, [projects, currentListProjects, activeFacets, normalizedQuery]);

  // Text search on top of the facet filter: matches project name, DAW, tags and plugins.
  const searchedProjects = useMemo(() => {
    if (!normalizedQuery) return facetFilteredProjects;
    return facetFilteredProjects.filter(p =>
      p.name.toLowerCase().includes(normalizedQuery) ||
      (p.daw || '').toLowerCase().includes(normalizedQuery) ||
      (p.tags || []).some(t => t.toLowerCase().includes(normalizedQuery)) ||
      (p.plugins || []).some(pl => pl.name.toLowerCase().includes(normalizedQuery))
    );
  }, [facetFilteredProjects, normalizedQuery]);

  // Folders matched by name — searched across the whole library while a query is active.
  const searchedFolders = useMemo(() => {
    if (!normalizedQuery) return currentListFolders;
    return folders.filter(f => f.name.toLowerCase().includes(normalizedQuery));
  }, [folders, currentListFolders, normalizedQuery]);

  const toggleFacet = useCallback((key: string) => {
    setActiveFacets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Flat lookup of every visible facet by its key, so the active-filter bar can
  // recover a facet's label/type from a stored key.
  const facetByKey = useMemo(() => {
    const map = new Map<string, Facet>();
    for (const facets of visibleFacetGroups.values()) {
      for (const f of facets) map.set(facetKey(f), f);
    }
    return map;
  }, [visibleFacetGroups]);

  // Active facets resolved to full objects for rendering the on-page filter bar.
  const activeFacetList = useMemo(() => {
    return Array.from(activeFacets).map(key => {
      const found = facetByKey.get(key);
      if (found) return { key, facet: found };
      const [type, value] = key.split('::');
      return { key, facet: { type, value, label: value } as Facet };
    });
  }, [activeFacets, facetByKey]);

  // Shared rectangular facet chip (used in both the filter panel and the on-page bar).
  const renderFacetChip = (
    key: string,
    facet: Facet,
    opts: { active: boolean; onClick: () => void; onRemove?: () => void }
  ) => (
    <button
      key={key}
      className={`facet-chip${opts.active ? ' facet-chip--active' : ''}${opts.onRemove ? ' facet-chip--removable' : ''}`}
      style={{ ['--facet-color']: facetColor(facet, tagColors) } as React.CSSProperties}
      onClick={opts.onClick}
      title={facet.label}
    >
      <span className="facet-chip-label">{facet.label}</span>
      {opts.onRemove && (
        <span
          className="facet-chip-remove"
          role="button"
          aria-label={`Remove ${facet.label} filter`}
          onClick={(e) => { e.stopPropagation(); opts.onRemove!(); }}
        >
          <X size={12} />
        </span>
      )}
    </button>
  );

  // Sync viewOrder when the folder/data changes
  useEffect(() => {
    if (loading) return;
    const key = `dawlab-order-my-projects-${currentFolderId ?? 'root'}`;
    const saved: string[] = JSON.parse(localStorage.getItem(key) || 'null') ?? [];

    const all: Array<{ kind: 'folder' | 'project'; id: string }> = [
      ...searchedFolders.sort((a, b) => a.position - b.position).map(f => ({ kind: 'folder' as const, id: f.id })),
      ...searchedProjects.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(p => ({ kind: 'project' as const, id: p.id })),
    ];

    if (saved.length) {
      const byKey = new Map(all.map(item => [`${item.kind}:${String(item.id)}`, item]));
      const ordered = saved.map(k => byKey.get(k)).filter(Boolean) as typeof all;
      const savedSet = new Set(saved);
      const newItems = all.filter(item => !savedSet.has(`${item.kind}:${String(item.id)}`));
      setViewOrder([...ordered, ...newItems]);
    } else {
      setViewOrder(all);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, loading, folders, projects, activeFacets, normalizedQuery]);

  // =======================
  // Render
  // =======================
  return (
    <div
      className="library-container"
      onDragEnter={handleFileDragEnter}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {isFileDragging && (
        <div
          className="library-drop-overlay"
          onDragOver={handleFileDragOver}
          onDragLeave={handleFileDragLeave}
          onDrop={handleFileDrop}
        >
          <div className="library-drop-overlay-inner">
            <FileMusic size={48} />
            <span className="library-drop-title">Drop to create a project</span>
            <span className="library-drop-sub">Logic, Ableton, FL Studio, Reaper, or Pro Tools</span>
          </div>
        </div>
      )}
      {dropError && !isFileDragging && (
        <div
          className="library-drop-overlay library-drop-overlay--error"
          onClick={() => setDropError(null)}
        >
          <div className="library-drop-overlay-inner">
            <X size={48} />
            <span className="library-drop-title">{dropError}</span>
            <span className="library-drop-sub">Drop a Logic, Ableton, FL Studio, Reaper, or Pro Tools project</span>
          </div>
        </div>
      )}
      {isLibraryEmpty && (
        <div className="empty-state-backdrop">
          <DitherGradient {...EMPTY_LIBRARY_DITHER} />
        </div>
      )}
      {/* Top Header */}
      <header className="library-header">
        <div className="header-left">
          <img src={logo} alt="Logo" className="app-logo" />
        </div>

        <div className="header-right">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
          </div>

          <div className={`search-wrapper${showSearch ? ' expanded' : ''}`}>
            <button
              className={`icon-btn search-btn${searchQuery ? ' active' : ''}`}
              onClick={() => {
                setShowSearch(prev => {
                  const next = !prev;
                  if (next) setTimeout(() => searchInputRef.current?.focus(), 0);
                  return next;
                });
              }}
              aria-label="Search projects"
            >
              <Search size={18} />
            </button>
            <input
              ref={searchInputRef}
              className="search-input"
              type="text"
              placeholder="Search by name, DAW, tag, plugin…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setSearchQuery(''); setShowSearch(false); }
              }}
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="filter-btn-wrapper" ref={filterMenuRef}>
            <button
              className={`icon-btn filter-btn${activeFacets.size > 0 ? ' active' : ''}`}
              onClick={() => setShowFilterMenu(prev => !prev)}
              aria-label="Filter projects"
            >
              <Filter size={18} />
              {activeFacets.size > 0 && (
                <span className="filter-active-badge">{activeFacets.size}</span>
              )}
            </button>
            {showFilterMenu && (
              <div className="filter-dropdown filter-dropdown--faceted">
                <div className="filter-panel-header">
                  <span className="filter-panel-title">Filters</span>
                  {activeFacets.size > 0 && (
                    <button
                      className="filter-panel-clear"
                      onClick={() => setActiveFacets(new Set())}
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {visibleFacetGroups.size === 0 ? (
                  <span className="filter-dropdown-empty">Nothing to filter in this view</span>
                ) : (
                  <div className="filter-facet-groups">
                    {Array.from(visibleFacetGroups.entries()).map(([type, facets]) => (
                      <div key={type} className="filter-facet-group">
                        <span className="filter-facet-heading">{FACET_GROUP_LABELS[type]}</span>
                        <div className="filter-dropdown-chips">
                          {facets.map(facet => {
                            const key = facetKey(facet);
                            return renderFacetChip(key, facet, {
                              active: activeFacets.has(key),
                              onClick: () => toggleFacet(key),
                            });
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="add-btn-wrapper" ref={addMenuRef}>
            <button className="icon-btn add-btn" onClick={() => setShowAddMenu(!showAddMenu)}>
              <Plus size={18} />
            </button>
            {showAddMenu && (
              <div className="add-dropdown">
                <button className="add-dropdown-item" onClick={() => { setShowNewProjectModal(true); setShowAddMenu(false); }}>
                  <FileMusic size={14} />
                  New Project
                </button>
                <button className="add-dropdown-item" onClick={() => { setShowNewFolderModal(true); setShowAddMenu(false); }}>
                  <FolderPlus size={14} />
                  New Folder
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="library-content" onContextMenu={handleEmptyContextMenu}>

        {/* Recently Saved Notification */}
        {recentlySavedProject && !currentFolderId && !recentlySavedDismissed && (
          <div className="recently-saved-toast" onClick={openRecentlySaved}>
            <div className="recent-toast-artwork">
              {getProjectIcon(recentlySavedProject.daw) ? (
                <img src={getProjectIcon(recentlySavedProject.daw)!} alt="DAW" />
              ) : (
                <Music size={18} />
              )}
            </div>
            <div className="recent-toast-info">
              <span className="recent-toast-title">
                Recently saved <strong>{recentlySavedProject.name}</strong>
              </span>
              <span className="recent-toast-time">
                {new Date(recentlySavedProject.latestModTime || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div className="recent-toast-open">
              Open
              <ArrowUpRight size={14} />
            </div>
            <button
              className="recent-toast-dismiss"
              onClick={(e) => {
                e.stopPropagation();
                setRecentlySavedDismissed(true);
              }}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content Grid/List */}
        <section className="content-grid-wrapper">
          {/* Active filter chips — visible on the page, not just in the popup */}
          {activeFacetList.length > 0 && (
            <div className="active-filters-bar">
              {activeFacetList.map(({ key, facet }) =>
                renderFacetChip(key, facet, {
                  active: true,
                  onClick: () => toggleFacet(key),
                  onRemove: () => toggleFacet(key),
                })
              )}
              <button
                className="active-filters-clear"
                onClick={() => setActiveFacets(new Set())}
              >
                Clear all
              </button>
            </div>
          )}
          {/* Breadcrumbs if deep */}
          {currentFolderId && (
            <div className="breadcrumb-bar">
               <span
                 className="crumb-root"
                 onClick={() => navigateToFolder(null)}
                 onDragOver={(e) => { e.preventDefault(); e.currentTarget.setAttribute('data-drag-over', 'true'); }}
                 onDragLeave={(e) => { e.currentTarget.removeAttribute('data-drag-over'); }}
                 onDrop={(e) => {
                   e.currentTarget.removeAttribute('data-drag-over');
                   if (!draggedItem) return;
                   if (draggedItem.type === 'project') {
                     setProjects(prev => prev.map(p => p.id === draggedItem.id ? { ...p, folderId: null } : p));
                     window.ipcRenderer.invoke('move-project-to-folder', draggedItem.id, null);
                   } else {
                     setFolders(prev => prev.map(f => f.id === draggedItem.id ? { ...f, parentId: null } : f));
                     window.ipcRenderer.invoke('move-folder', draggedItem.id, null);
                   }
                   setDraggedItem(null);
                 }}
               >
                 My Files
               </span>
               {getBreadcrumbsArray().slice(1).map((crumb, idx, arr) => (
                 <span key={crumb.id || `crumb-${idx}`} className="breadcrumb-span">
                    <span className="sep">/</span>
                    <span
                      className={`crumb ${idx === arr.length - 1 ? 'active' : ''}`}
                      onClick={() => navigateToFolder(crumb.id)}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.setAttribute('data-drag-over', 'true'); }}
                      onDragLeave={(e) => { e.currentTarget.removeAttribute('data-drag-over'); }}
                      onDrop={(e) => {
                        e.currentTarget.removeAttribute('data-drag-over');
                        if (!draggedItem || !crumb.id) return;
                        if (draggedItem.type === 'project') {
                          setProjects(prev => prev.map(p => p.id === draggedItem.id ? { ...p, folderId: crumb.id } : p));
                          window.ipcRenderer.invoke('move-project-to-folder', draggedItem.id, crumb.id);
                        } else {
                          if (draggedItem.id !== crumb.id && !isDescendant(crumb.id, draggedItem.id as string)) {
                            setFolders(prev => prev.map(f => f.id === draggedItem.id ? { ...f, parentId: crumb.id } : f));
                            window.ipcRenderer.invoke('move-folder', draggedItem.id, crumb.id);
                          }
                        }
                        setDraggedItem(null);
                      }}
                    >
                      {crumb.name}
                    </span>
                 </span>
               ))}
            </div>
          )}

          {loading ? (
             <div className="loading-state"><Loader2 className="animate-spin" /> Loading...</div>
          ) : (
             <div
               className={`items-container ${viewMode}`}
               onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => { e.preventDefault(); saveViewOrder(); setDraggedItem(null); }}
             >
                {viewMode === 'grid' ? (
                  viewOrder.map(({ kind, id }) => {
                    if (kind === 'folder') {
                      const folder = folders.find(f => f.id === id);
                      if (!folder) return null;
                      const childProjects = projects.filter(p => p.folderId === folder.id);
                      const childSubfolders = folders.filter(f => f.parentId === folder.id);
                      const childCount = childProjects.length + childSubfolders.length;
                      const isFolderEmpty = childCount === 0;
                      return (
                        <div
                          key={`folder-${folder.id}`}
                          className={`library-item folder${draggedItem?.id === folder.id && draggedItem?.type === 'folder' ? ' dragging' : ''}${dragOverFolderId === folder.id && draggedItem?.id !== folder.id ? ' drag-over-folder' : ''}`}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
                          onDragEnter={() => handleDragEnterItem(folder.id, 'folder')}
                          onDragOver={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                          onDrop={(e) => handleDropOnFolder(e, folder.id)}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => handleFolderClick(e, folder.id)}
                          onDoubleClick={() => enterFolder(folder.id)}
                          onContextMenu={(e) => handleContextMenu(e, folder.id)}
                        >
                          <div className="item-icon-wrapper folder-wrapper">
                             <div className="folder-peek-tile">
                               {Array.from({ length: 4 }).map((_, i) => {
                                 const p = childProjects[i];
                                 return (
                                   <div key={i} className="folder-peek-slot">
                                     {p ? (
                                       getProjectIcon(p.daw) ? (
                                         <img src={getProjectIcon(p.daw)!} alt={p.daw} />
                                       ) : (
                                         <Music size={18} />
                                       )
                                     ) : null}
                                   </div>
                                 );
                               })}
                             </div>
                          </div>
                          <span className="item-label">{folder.name}</span>
                          <span className="item-sublabel">
                            {isFolderEmpty ? 'Empty' : `${childCount} item${childCount === 1 ? '' : 's'}`}
                          </span>
                        </div>
                      );
                    } else {
                      const project = projects.find(p => p.id === id);
                      if (!project) return null;
                      return (
                        <div
                          key={`project-${project.id}`}
                          className={`library-item project${draggedItem?.id === project.id && draggedItem?.type === 'project' ? ' dragging' : ''}${playingId === project.id ? ' playing' : ''}`}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'project', project.id)}
                          onDragEnter={() => handleDragEnterItem(project.id, 'project')}
                          onDragOver={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          onDrop={(e) => { e.stopPropagation(); e.preventDefault(); saveViewOrder(); setDraggedItem(null); }}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => openProject(project.id, project.name)}
                          onContextMenu={(e) => handleProjectContextMenu(e, project.id)}
                        >
                          <div className="item-icon-wrapper project-wrapper">
                             {getProjectIcon(project.daw) ? (
                               <img src={getProjectIcon(project.daw)!} alt="DAW" className="project-icon-img" />
                             ) : (
                               <div className="generic-icon"><Music size={32} /></div>
                             )}
                             {project.hasPreview && (
                               <button
                                 className="item-preview-btn"
                                 onClick={(e) => { e.stopPropagation(); togglePreview(project); }}
                                 aria-label={playingId === project.id ? 'Stop preview' : 'Play preview'}
                               >
                                 {loadingId === project.id ? (
                                   <Loader2 size={18} className="animate-spin" />
                                 ) : playingId === project.id ? (
                                   <Square size={18} />
                                 ) : (
                                   <Play size={18} />
                                 )}
                               </button>
                             )}
                          </div>
                          <span className="item-label">{project.name}</span>
                          <span className="item-sublabel">{projectMetaLine(project)}</span>
                          {(project.tags || []).length > 0 && (
                            <div className="item-tags">
                              {project.tags!.slice(0, 2).map(tag => (
                                <TagChip key={tag} tag={tag} color={tagColors[tag]} />
                              ))}
                              {project.tags!.length > 2 && (
                                <span className="item-tags-more">+{project.tags!.length - 2}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                  })
                ) : (
                  viewOrder.map(({ kind, id }) => {
                    if (kind === 'folder') {
                      const folder = folders.find(f => f.id === id);
                      if (!folder) return null;
                      const childProjects = projects.filter(p => p.folderId === folder.id);
                      return (
                        <div
                          key={`folder-${folder.id}`}
                          className={`list-row${draggedItem?.id === folder.id && draggedItem?.type === 'folder' ? ' dragging' : ''}${dragOverFolderId === folder.id && draggedItem?.id !== folder.id ? ' drag-over-folder' : ''}`}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
                          onDragEnter={() => handleDragEnterItem(folder.id, 'folder')}
                          onDragOver={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          onDragLeave={() => { if (dragOverFolderId === folder.id) setDragOverFolderId(null); }}
                          onDrop={(e) => handleDropOnFolder(e, folder.id)}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => setCurrentFolderId(folder.id)}
                          onContextMenu={(e) => handleContextMenu(e, folder.id)}
                        >
                          <div className="list-icon folder-wrapper">
                             <div className="folder-peek-tile">
                               {Array.from({ length: 4 }).map((_, i) => {
                                 const p = childProjects[i];
                                 return (
                                   <div key={i} className="folder-peek-slot">
                                     {p ? (
                                       getProjectIcon(p.daw) ? (
                                         <img src={getProjectIcon(p.daw)!} alt={p.daw} />
                                       ) : (
                                         <Music size={14} />
                                       )
                                     ) : null}
                                   </div>
                                 );
                               })}
                             </div>
                          </div>
                          <span className="list-name">{folder.name}</span>
                        </div>
                      );
                    } else {
                      const project = projects.find(p => p.id === id);
                      if (!project) return null;
                      return (
                        <div
                          key={`project-${project.id}`}
                          className={`list-row${draggedItem?.id === project.id && draggedItem?.type === 'project' ? ' dragging' : ''}${playingId === project.id ? ' playing' : ''}`}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, 'project', project.id)}
                          onDragEnter={() => handleDragEnterItem(project.id, 'project')}
                          onDragOver={(e) => { e.stopPropagation(); e.preventDefault(); }}
                          onDrop={(e) => { e.stopPropagation(); e.preventDefault(); saveViewOrder(); setDraggedItem(null); }}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => openProject(project.id, project.name)}
                          onContextMenu={(e) => handleProjectContextMenu(e, project.id)}
                        >
                          <div className="list-icon">
                             {getProjectIcon(project.daw) ? (
                               <img src={getProjectIcon(project.daw)!} alt="DAW" className="list-icon-img" />
                             ) : (
                               <div className="list-icon-placeholder"><Music size={28} /></div>
                             )}
                             {project.hasPreview && (
                               <button
                                 className="list-preview-btn"
                                 onClick={(e) => { e.stopPropagation(); togglePreview(project); }}
                                 aria-label={playingId === project.id ? 'Stop preview' : 'Play preview'}
                               >
                                 {loadingId === project.id ? (
                                   <Loader2 size={16} className="animate-spin" />
                                 ) : playingId === project.id ? (
                                   <Square size={16} />
                                 ) : (
                                   <Play size={16} />
                                 )}
                               </button>
                             )}
                          </div>
                          <span className="list-name">{project.name}</span>
                          <div className="list-meta">
                            <span className="list-meta-label">Last commit:</span>
                            <span className="list-meta-value">
                              {project.created_at
                                ? new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + new Date(project.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
                                : '—'}
                            </span>
                          </div>
                          {(project.tags || []).length > 0 && (
                            <div className="list-tags">
                              {project.tags!.slice(0, 3).map(tag => (
                                <TagChip key={tag} tag={tag} color={tagColors[tag]} />
                              ))}
                              {project.tags!.length > 3 && (
                                <span className="list-tags-more">+{project.tags!.length - 3}</span>
                              )}
                            </div>
                          )}
                          <div className="list-actions">
                            <button
                              className="list-action-btn list-action-btn--save"
                              onClick={(e) => { e.stopPropagation(); openProject(project.id, project.name); }}
                            >
                              Save
                            </button>
                            <button
                              className="list-action-btn"
                              onClick={(e) => { e.stopPropagation(); openProject(project.id, project.name); }}
                            >
                              Open in DAW
                            </button>
                          </div>
                        </div>
                      );
                    }
                  })
                )}

                {!normalizedQuery && activeFacets.size === 0 &&
                  currentListFolders.length === 0 && currentListProjects.length === 0 && (
                  <div className="empty-state-content">
                    <FileMusic size={32} className="empty-state-icon" />
                    <h3 className="empty-state-title">
                      {currentFolderId ? 'This folder is empty' : 'Start your first project'}
                    </h3>
                    <p className="empty-state-subtitle">
                      {currentFolderId
                        ? 'Drag a project in, or create a new one right here.'
                        : 'Bring in a Logic, Ableton, FL Studio, Reaper, or Pro Tools project to start tracking every version.'}
                    </p>
                    <button className="empty-state-cta" onClick={() => setShowNewProjectModal(true)}>
                      <Plus size={16} />
                      New Project
                    </button>
                  </div>
                )}

                {(normalizedQuery !== '' || activeFacets.size > 0) &&
                  viewOrder.length === 0 && (
                  <div className="empty-state-content">
                    <Search size={32} className="empty-state-icon" />
                    <h3 className="empty-state-title">No matches</h3>
                    <p className="empty-state-subtitle">
                      {normalizedQuery
                        ? `Nothing matches “${searchQuery.trim()}”.`
                        : 'No projects match the active filters.'}
                    </p>
                  </div>
                )}

             </div>
          )}
        </section>
      </main>

      {/* Bottom Bar */}
      <footer className="library-footer">
        <div className="footer-left">
           <div className="user-avatar" onClick={() => navigate('/settings')} style={{ cursor: 'pointer' }}>
              <User size={20} />
           </div>
        </div>

        <div className="footer-right">
           <ActivityPanel embedded={true} />
        </div>
      </footer>

      {/* Modals & Context Menus */}
      {contextMenu && (
        <ContextMenu
          ref={contextMenuRef}
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
        />
      )}

      {/* Tag Manager Popover */}
      {tagPopover && (() => {
        const proj = projects.find(p => p.id === tagPopover.projectId);
        return (
          <TagManagerPopover
            x={tagPopover.x}
            y={tagPopover.y}
            tags={proj?.tags || []}
            tagColors={tagColors}
            onAddTag={(tag, color) => handleTagPopoverAdd(tagPopover.projectId, tag, color)}
            onRemoveTag={(tag) => handleTagPopoverRemove(tagPopover.projectId, tag)}
            onClose={() => setTagPopover(null)}
          />
        );
      })()}

      {/* Folder Peek (iOS-style in-place preview) */}
      {peek && (() => {
        const folder = folders.find(f => f.id === peek.folderId);
        if (!folder) return null;
        const childProjects = projects.filter(p => p.folderId === peek.folderId);
        const childSubfolders = folders.filter(f => f.parentId === peek.folderId);
        return (
          <FolderPeek
            folder={folder}
            projects={childProjects}
            subfolders={childSubfolders}
            getIcon={getProjectIcon}
            anchorRect={peek.rect}
            onOpenProject={(id, name) => { setPeek(null); openProject(id, name); }}
            onEnterFolder={enterFolder}
            onEnterSubfolder={enterFolder}
            onClose={() => setPeek(null)}
          />
        );
      })()}

      {/* New Project Modal */}
      <NewProject
        isOpen={showNewProjectModal}
        initialPath={dropInit?.path}
        initialName={dropInit?.name}
        initialDaw={dropInit?.daw}
        onClose={() => { setShowNewProjectModal(false); setDropInit(null); }}
        onSuccess={(projectId?: string) => {
          const droppedInto = dropInit?.folderId ?? null;
          setShowNewProjectModal(false);
          setDropInit(null);
          // A project dropped inside a folder should land in that folder.
          if (droppedInto && projectId) {
            window.ipcRenderer
              .invoke('move-project-to-folder', projectId, droppedInto)
              .catch(() => {})
              .finally(() => loadMyProjects());
          } else {
            loadMyProjects();
          }
        }}
      />

      {/* New Folder Modal */}
      <InputModal
        isOpen={showNewFolderModal}
        title="Create New Folder"
        label="Folder Name"
        value={newFolderName}
        onChange={setNewFolderName}
        onSubmit={handleCreateFolder}
        onClose={() => setShowNewFolderModal(false)}
        submitText="Create"
      />

      {/* Rename Folder Modal */}
      <InputModal
        isOpen={showRenameModal}
        title="Rename Folder"
        label="Folder Name"
        value={renameValue}
        onChange={setRenameValue}
        onSubmit={handleRenameSubmit}
        onClose={() => { setShowRenameModal(false); setFolderToRename(null); }}
        submitText="Rename"
      />

      {/* Delete Folder Confirmation */}
      <WarningModal
        isOpen={showDeleteConfirm && !!folderToDelete}
        title="Delete Folder"
        message={folderToDelete ? `Are you sure you want to delete "${folderToDelete.name}"?` : ''}
        warningType="delete-folder"
        actions={[
          { label: 'Cancel', onClick: () => { setShowDeleteConfirm(false); setFolderToDelete(null); }, variant: 'cancel' },
          { label: 'Delete', onClick: () => handleConfirmDelete(), variant: 'destructive' },
        ]}
        onCancel={() => { setShowDeleteConfirm(false); setFolderToDelete(null); }}
      />
    </div>
  );
};
