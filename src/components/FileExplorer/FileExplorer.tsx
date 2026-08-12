import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, Folder, File, Mic, FileMusic, FileCode, Copy, FolderOpen, Check, EyeOff, RotateCcw } from 'lucide-react';
import dawlabLogo from '@/assets/logo.png';
import './FileExplorer.css';

interface FileMapEntry {
  path: string;
  hash: string;
}

interface FileExplorerProps {
  projectName: string;
  commitId?: string;
  projectPath: string | null;
  onSelectPath?: () => void;
}

interface TreeNode {
  name: string;
  path: string; // full relative path from root
  type: 'file' | 'folder';
  children?: Record<string, TreeNode>;
  tracked: boolean; // false = in ignoredFiles, excluded from future commits
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ projectName, commitId, projectPath, onSelectPath }) => {
  const [fileMap, setFileMap] = useState<FileMapEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [pathCopied, setPathCopied] = useState(false);
  const [hasDawlabStorage, setHasDawlabStorage] = useState(false);
  const [ignoredFiles, setIgnoredFiles] = useState<string[]>([]);

  useEffect(() => {
    const fetchFileMap = async () => {
      if (!projectName || !commitId) {
        setFileMap([]);
        return;
      }

      setLoading(true);
      try {
        const map = await window.ipcRenderer.invoke('get-commit-filemap', projectName, commitId);
        setFileMap(map || []);

        // Auto-expand root folders
        const roots = new Set<string>();
        (map || []).forEach((file: FileMapEntry) => {
           const parts = file.path.split('/');
           if (parts.length > 1) {
             roots.add(parts[0]);
           }
        });
        setExpandedFolders(roots);

      } catch (error) {
        console.error('Failed to fetch file map:', error);
        setFileMap([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFileMap();
  }, [projectName, commitId]);

  useEffect(() => {
    if (!projectPath || projectPath === 'NA') {
      setHasDawlabStorage(false);
      return;
    }
    window.ipcRenderer.invoke('get-dawlabproject-status', projectPath)
      .then((result: { exists: boolean }) => setHasDawlabStorage(!!result?.exists))
      .catch(() => setHasDawlabStorage(false));
  }, [projectPath]);

  useEffect(() => {
    if (!projectName) {
      setIgnoredFiles([]);
      return;
    }
    window.ipcRenderer.invoke('get-local-project-log', projectName)
      .then((log: any) => setIgnoredFiles(log?.ignoredFiles || []))
      .catch(() => setIgnoredFiles([]));
  }, [projectName, commitId]);

  const persistIgnoredFiles = useCallback(async (next: string[]) => {
    setIgnoredFiles(next);
    try {
      await window.ipcRenderer.invoke('update-project-log', projectName, { ignoredFiles: next });
    } catch (error) {
      console.error('Failed to update ignored files:', error);
    }
  }, [projectName]);

  const ignorePath = (relPath: string) => {
    if (ignoredFiles.includes(relPath)) return;
    persistIgnoredFiles([...ignoredFiles, relPath]);
  };

  const unignorePath = (relPath: string) => {
    persistIgnoredFiles(ignoredFiles.filter((f) => f !== relPath));
  };

  // Build tree structure from the flat committed file list, then overlay
  // ignored paths in their real folder position (marked untracked) so users
  // manage what's ignored right where it lives, not in a separate list.
  const tree = useMemo(() => {
    const root: Record<string, TreeNode> = {};

    fileMap.forEach(file => {
      // Older commits (made before .dawlabproject was excluded from tracking)
      // may still have it baked into their filemap - hide it from the real
      // tree since it's already shown separately as the synthetic storage row.
      if (file.path === '.dawlabproject' || file.path.startsWith('.dawlabproject/')) return;

      const parts = file.path.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;

        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            children: isFile ? undefined : {},
            tracked: true,
          };
        }

        if (!isFile && currentLevel[part].children) {
          currentLevel = currentLevel[part].children!;
        }
      });
    });

    // Ignored paths are excluded from future commits, so they won't be in
    // fileMap going forward - insert (or mark) them directly so they still
    // show up where they live, instead of a disconnected list elsewhere.
    ignoredFiles.forEach(ignoredPath => {
      const parts = ignoredPath.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;

        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            path: currentPath,
            // We only know the ignored path itself, not what it once
            // contained - render it as a leaf; intermediate segments must
            // be folders to hold it.
            type: isLast ? 'file' : 'folder',
            children: isLast ? undefined : {},
            tracked: !isLast,
          };
        } else if (isLast) {
          currentLevel[part].tracked = false;
        }

        if (!isLast && currentLevel[part].children) {
          currentLevel = currentLevel[part].children!;
        }
      });
    });

    return root;
  }, [fileMap, ignoredFiles]);

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderTree = (nodes: Record<string, TreeNode>, depth = 0) => {
    // Sort: Folders first, then files, alphabetical within groups
    const sortedKeys = Object.keys(nodes).sort((a, b) => {
      const nodeA = nodes[a];
      const nodeB = nodes[b];
      if (nodeA.type !== nodeB.type) {
        return nodeA.type === 'folder' ? -1 : 1;
      }
      return a.localeCompare(b);
    });

    return sortedKeys.map(key => {
      const node = nodes[key];
      const isExpanded = expandedFolders.has(node.path);
      const isFolder = node.type === 'folder';

      // Determine icon based on file extension
      let Icon = File;
      if (isFolder) {
        Icon = Folder;
      } else {
        const ext = node.name.split('.').pop()?.toLowerCase();
        if (['wav', 'mp3', 'aiff', 'flac', 'm4a', 'ogg'].includes(ext || '')) Icon = Mic; // Audio
        else if (['als', 'logicx', 'flp', 'rpp', 'ptx'].includes(ext || '')) Icon = FileMusic; // Project files
        else if (['json', 'xml', 'txt', 'md', 'js', 'ts'].includes(ext || '')) Icon = FileCode; // Code/Config
      }

      const canExpand = isFolder && !!node.children && Object.keys(node.children).length > 0;

      return (
        <div key={node.path} className="tree-node">
          <div
            className={`tree-row ${isFolder ? 'is-folder' : ''} ${!node.tracked ? 'is-untracked' : ''}`}
            style={{ paddingLeft: `${depth * 20}px` }}
            onClick={() => canExpand && toggleFolder(node.path)}
          >
            <span className="tree-icon-container">
              {canExpand && (
                <span className={`tree-expander ${isExpanded ? 'expanded' : ''}`}>
                  <ChevronRight size={14} />
                </span>
              )}
              {!canExpand && <span className="tree-spacer" />}
              <Icon size={16} className={`tree-type-icon ${isFolder ? 'folder-icon' : 'file-icon'}`} />
            </span>
            <span className="tree-label">{node.name}</span>
            {!node.tracked && <span className="untracked-badge">Not tracked</span>}
            {node.tracked ? (
              <button
                type="button"
                className="tree-ignore-button"
                title={`Stop tracking "${node.name}" from future commits`}
                onClick={(e) => {
                  e.stopPropagation();
                  ignorePath(node.path);
                }}
              >
                <EyeOff size={13} />
                <span>Ignore</span>
              </button>
            ) : (
              <button
                type="button"
                className="tree-restore-button"
                title={`Track "${node.name}" again`}
                onClick={(e) => {
                  e.stopPropagation();
                  unignorePath(node.path);
                }}
              >
                <RotateCcw size={13} />
                <span>Restore</span>
              </button>
            )}
          </div>

          {canExpand && isExpanded && node.children && (
            <div className="tree-children">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (!commitId) return null;

  const isPathValid = projectPath && projectPath !== 'NA';

  return (
    <div className="file-tree-section">
      {projectPath === 'NA' ? (
        <div className="file-tree-header-row">
          <button 
            className="connect-folder-btn"
            onClick={onSelectPath}
          >
            Select Project Location
          </button>
        </div>
      ) : isPathValid && (
        <div className="project-path-unit">
          <div className="project-path-box">
            {projectPath.replace(/ /g, '\u00A0').replace(/\//g, '\u200B/')}
          </div>
          <div className="project-path-actions-inline">
            <button
              type="button"
              onClick={() => {
                if (projectPath) {
                  navigator.clipboard.writeText(projectPath);
                  setPathCopied(true);
                  setTimeout(() => setPathCopied(false), 2000);
                }
              }}
              className="project-path-icon-button"
              title={pathCopied ? "Copied!" : "Copy path"}
            >
              {pathCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (projectPath) {
                  await window.ipcRenderer.invoke('open-in-finder', projectPath);
                }
              }}
              className="project-path-icon-button"
              title="Open in Finder"
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="file-tree-container">
        {hasDawlabStorage && (
          <div className="tree-node">
            <div className="tree-row dawlab-storage-row" title="DAWLab's own version history storage - not part of your tracked files">
              <span className="tree-icon-container">
                <span className="tree-spacer" />
                <img src={dawlabLogo} alt="" className="tree-dawlab-icon" />
              </span>
              <span className="tree-label">.dawlabproject</span>
              <span className="dawlab-storage-badge">DAWLab storage</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="file-tree-loading">Loading files...</div>
        ) : Object.keys(tree).length === 0 && !hasDawlabStorage ? (
          <div className="file-tree-empty">No files recorded for this version</div>
        ) : (
          renderTree(tree)
        )}
      </div>
    </div>
  );
};
