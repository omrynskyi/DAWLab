import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, AlertCircle, CheckCircle, Search, RefreshCw, HardDrive } from 'lucide-react';
import './Settings.css'; // Re-use settings styles for consistency
import './CleanStorage.css'; // Specific styles

interface CleanableFile {
  hash: string;
  size: number;
  filename: string;
  projectNames: string[];
}

interface CleanStats {
  filesDeleted: number;
  bytesFreed: number;
  errors: string[];
}

// Helper to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const CleanStorage: React.FC = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<CleanableFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [cleaning, setCleaning] = useState(false);
  const [cleanStats, setCleanStats] = useState<CleanStats | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sorting state
  const [sortField, setSortField] = useState<'size' | 'filename' | 'projects'>('size');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const fetchFiles = async () => {
    setLoading(true);
    try {
      // access global ipcRenderer directly as it's likely exposed on window
      const results = await (window as any).ipcRenderer.invoke('get-cleanable-files');
      setFiles(results);
    } catch (err) {
      console.error('Failed to fetch cleanable files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleSort = (field: 'size' | 'filename' | 'projects') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'size' ? 'desc' : 'asc'); // Default size to desc, others to asc
    }
  };

  const filteredAndSortedFiles = useMemo(() => {
    let result = [...files];

    // Filter
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(f => 
        f.filename.toLowerCase().includes(lower) || 
        f.projectNames.some(p => p.toLowerCase().includes(lower))
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'filename':
          comparison = a.filename.localeCompare(b.filename);
          break;
        case 'projects':
          comparison = a.projectNames.join(', ').localeCompare(b.projectNames.join(', '));
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [files, searchTerm, sortField, sortDirection]);

  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);

  // Reset last selected index when list order changes
  useEffect(() => {
    setLastSelectedIndex(-1);
  }, [files, searchTerm, sortField, sortDirection]);

  const handleSelection = (hash: string, index: number, shiftKey: boolean) => {
    const newSet = new Set(selectedHashes);
    const isSelected = newSet.has(hash);
    const shouldSelect = !isSelected;
    
    if (shiftKey && lastSelectedIndex !== -1) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const range = filteredAndSortedFiles.slice(start, end + 1);
      
      // Apply the target state (select or deselect) to the entire range
      range.forEach(f => {
        if (shouldSelect) {
            newSet.add(f.hash);
        } else {
            newSet.delete(f.hash);
        }
      });
    } else {
      if (shouldSelect) {
        newSet.add(hash);
      } else {
        newSet.delete(hash);
      }
    }
    
    setSelectedHashes(newSet);
    // Only update lastSelectedIndex if we clicked a specific item (which we did)
    setLastSelectedIndex(index);
  };

  const toggleSelectAll = () => {
    if (selectedHashes.size === filteredAndSortedFiles.length) {
      setSelectedHashes(new Set());
    } else {
      setSelectedHashes(new Set(filteredAndSortedFiles.map(f => f.hash)));
    }
  };

  const handleClean = async () => {
    if (selectedHashes.size === 0) return;
    
    setCleaning(true);
    try {
      const hashesToClean = Array.from(selectedHashes);
      const stats = await (window as any).ipcRenderer.invoke('clean-cas-files', hashesToClean);
      setCleanStats(stats);
      
      // Remove cleaned files from list
      setFiles(prev => prev.filter(f => !selectedHashes.has(f.hash)));
      setSelectedHashes(new Set());
      
    } catch (err) {
      console.error('Failed to clean files:', err);
    } finally {
      setCleaning(false);
    }
  };

  const totalSelectedSize = filteredAndSortedFiles
    .filter(f => selectedHashes.has(f.hash))
    .reduce((acc, curr) => acc + curr.size, 0);

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragAction, setDragAction] = useState<'select' | 'deselect' | null>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragAction(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleMouseDown = (hash: string, index: number, shiftKey: boolean) => {
    // If shift key is pressed, use the shift-click logic and DO NOT start dragging
    // Standard OS behavior usually separates shift-click range select from drag select
    if (shiftKey) {
        handleSelection(hash, index, true);
        return;
    }

    // Start dragging
    setIsDragging(true);
    const isSelected = selectedHashes.has(hash);
    const action = isSelected ? 'deselect' : 'select';
    setDragAction(action);
    
    // Apply initial action to the clicked item
    // We use handleSelection but with shiftKey=false to toggle just this one
    // But since we know the action, we can force it
    const newSet = new Set(selectedHashes);
    if (action === 'select') newSet.add(hash);
    else newSet.delete(hash);
    
    setSelectedHashes(newSet);
    setLastSelectedIndex(index);
  };

  const handleMouseEnter = (hash: string, index: number) => {
    if (isDragging && dragAction) {
        const newSet = new Set(selectedHashes);
        if (dragAction === 'select') newSet.add(hash);
        else newSet.delete(hash);
        
        setSelectedHashes(newSet);
        setLastSelectedIndex(index);
    }
  };

  return (
    <div className="clean-storage-page">
      <div className="clean-storage-header">
        <button onClick={() => navigate('/settings')} className="back-button">
          <ArrowLeft size={20} />
          Back
        </button>
        <h1>Clean Local Storage</h1>
        <p className="subtitle">
          Free up space by removing unused files left over from deleted or modified projects.
        </p>
      </div>

      <div className="info-banner">
        <AlertCircle size={20} className="info-icon" />
        <p>
          These files aren't referenced by any commit in any of your current projects.
          Deleting them won't impact your projects — this permanently removes them, so only continue if you're sure you don't need them.
        </p>
      </div>

      {cleanStats && (
        <div className="clean-stats-banner success">
            <div className="stats-content">
                <CheckCircle size={20} />
                <span>
                    Successfully cleaned <strong>{cleanStats.filesDeleted}</strong> files 
                    releasing <strong>{formatBytes(cleanStats.bytesFreed)}</strong> of space.
                </span>
            </div>
            <button onClick={() => setCleanStats(null)}><X size={16} /></button>
        </div>
      )}

      <div className="clean-controls">
        <div className="search-box">
            <Search size={16} className="search-icon" />
            <input 
                type="text" 
                placeholder="Search files or projects..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>
        
        <div className="actions-right">
             <div className="selected-info">
                {selectedHashes.size > 0 && (
                    <span className="selection-stats">
                        {selectedHashes.size} files ({formatBytes(totalSelectedSize)})
                    </span>
                )}
             </div>
             <button 
                className={`btn-clean ${selectedHashes.size === 0 ? 'disabled' : ''}`}
                onClick={handleClean}
                disabled={selectedHashes.size === 0 || cleaning}
             >
                {cleaning ? (
                    <>
                        <RefreshCw size={16} className="spin" />
                        Cleaning...
                    </>
                ) : (
                    <>
                        <Trash2 size={16} />
                        Clean Selected
                    </>
                )}
             </button>
        </div>
      </div>

      <div className="files-table-container">
        {loading ? (
            /* ... loading ... */
            <div className="loading-state">
                <Loader2 size={32} className="spin" />
                <p>Scanning local storage...</p>
            </div>
        ) : files.length === 0 ? (
            /* ... empty ... */
            <div className="empty-state">
                <CheckCircle size={48} className="empty-icon" />
                <h3>Your local storage is clean!</h3>
                <p>No redundant files found.</p>
            </div>
        ) : (
            <table className="files-table">
                <thead>
                    {/* ... header row ... */}
                    <tr>
                        <th className="th-checkbox">
                            <input 
                                type="checkbox" 
                                checked={filteredAndSortedFiles.length > 0 && selectedHashes.size === filteredAndSortedFiles.length}
                                onChange={toggleSelectAll}
                            />
                        </th>
                        <th className="th-filename" onClick={() => handleSort('filename')}>
                            Filename {sortField === 'filename' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="th-projects" onClick={() => handleSort('projects')}>
                            Projects {sortField === 'projects' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="th-size" onClick={() => handleSort('size')}>
                            Size {sortField === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {filteredAndSortedFiles.map((file, index) => (
                        <tr 
                            key={file.hash} 
                            className={selectedHashes.has(file.hash) ? 'selected' : ''} 
                            onMouseDown={(e) => handleMouseDown(file.hash, index, e.shiftKey)}
                            onMouseEnter={() => handleMouseEnter(file.hash, index)}
                        >
                            <td>
                                <input 
                                    type="checkbox" 
                                    checked={selectedHashes.has(file.hash)}
                                    readOnly
                                    style={{ pointerEvents: 'none' }}
                                />
                            </td>
                            <td className="filename-cell">
                                <div className="file-icon"><HardDrive size={14} /></div>
                                {file.filename}
                                <span className="hash-preview" title={file.hash}>{file.hash.substring(0, 6)}</span>
                            </td>
                            <td className="projects-cell">
                                {file.projectNames.map(p => (
                                    <span key={p} className="project-badge">{p}</span>
                                ))}
                            </td>
                            <td className="size-cell">
                                {formatBytes(file.size)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

// Simple embedded styles for Loader2 and X if not imported
const Loader2 = ({size, className}: {size: number, className?: string}) => (
    <RefreshCw size={size} className={className} />
);
const X = ({size}: {size: number}) => (
    <span style={{fontSize: size}}>✕</span>
);

export default CleanStorage;
