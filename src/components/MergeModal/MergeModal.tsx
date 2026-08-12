import React, { useState, useEffect, useRef } from "react";

import './MergeModal.css';

interface Branch {
  name: string;
  commits?: Array<{
    message: string;
    timestamp: string;
    author: string;
  }>;
}

interface ProjectLog {
  branches: Branch[];
  current_branch: string;
}

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fromBranch: string, intoBranch: string) => void;
  projectName: string;
  projectId: string;
}

export const MergeModal: React.FC<MergeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  projectName,
  projectId,
}) => {
  const [projectLog, setProjectLog] = useState<ProjectLog | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isDropped, setIsDropped] = useState(false);
  const [isOverDropZone, setIsOverDropZone] = useState(false);

  const dragStartY = useRef(0);
  const draggedElementRef = useRef<HTMLElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  // Load project log when modal opens
  useEffect(() => {
    if (isOpen && projectName) {
      const loadLog = async () => {
        try {
          const log = await window.ipcRenderer.invoke('get-project-log', projectName, projectId);
          setProjectLog(log);

          const otherBranches = log.branches.filter((b: Branch) => b.name !== log.current_branch);
          setSelectedBranch(otherBranches[0]?.name || log.branches[0]?.name || 'main');
        } catch (error) {
          console.error('Error loading project log:', error);
        }
      };
      loadLog();
    }
  }, [isOpen, projectName, projectId]);

  // Handle mouse move and up events
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggedElementRef.current) return;

      const deltaY = e.clientY - dragStartY.current;
      draggedElementRef.current.style.transform = `translateY(${deltaY}px)`;

      // Check if over drop zone
      if (dropZoneRef.current) {
        const rect = dropZoneRef.current.getBoundingClientRect();
        const isOver = (
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right
        );
        setIsOverDropZone(isOver);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!draggedElementRef.current) return;

      // Check if dropped in zone
      if (dropZoneRef.current && isOverDropZone) {
        const rect = dropZoneRef.current.getBoundingClientRect();
        const isOver = (
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right
        );

        if (isOver) {
          setIsDropped(true);
        } else {
          draggedElementRef.current.style.transform = '';
        }
      } else {
        draggedElementRef.current.style.transform = '';
      }

      // Cleanup
      draggedElementRef.current.style.cursor = '';
      draggedElementRef.current.style.zIndex = '';
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setIsDragging(false);
      setIsOverDropZone(false);
      draggedElementRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isOverDropZone]);

  if (!isOpen || !projectLog) return null;

  const branches = projectLog.branches.map(b => b.name);
  const currentBranch = projectLog.current_branch || 'main';
  const availableBranches = branches.filter(b => b !== currentBranch);

  // Show error if not enough branches
  if (branches.length < 2) {
    return (
      <div className="merge-modal-overlay" onClick={onClose}>
        <div className="merge-modal-container merge-modal-error" onClick={(e) => e.stopPropagation()}>
          <button className="close-button" onClick={onClose} title="Close">
            <div className="close-dot" />
          </button>
          <div className="error-content">
            <h2 className="merge-modal-title">Cannot Import</h2>
            <p className="error-text">You need at least 2 branches to perform an import.</p>
            <button className="action-button primary" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    );
  }

  // Get branch data
  const getCurrentBranch = () => {
    const branch = projectLog.branches.find(b => b.name === currentBranch);
    const commits = branch?.commits || [];
    const latestCommit = commits[commits.length - 1]; // Get last commit (newest in chronological order)
    return {
      name: currentBranch,
      commitMessage: latestCommit?.message || "No versions yet",
      timestamp: latestCommit?.timestamp || "",
      owner: latestCommit?.author || "Unknown"
    };
  };

  const getSelectedBranch = () => {
    const branch = projectLog.branches.find(b => b.name === selectedBranch);
    const commits = branch?.commits || [];
    const latestCommit = commits[commits.length - 1]; // Get last commit (newest in chronological order)
    return {
      name: selectedBranch,
      commitMessage: latestCommit?.message || "No versions yet",
      timestamp: latestCommit?.timestamp || "",
      owner: latestCommit?.author || "Unknown"
    };
  };

  const topBranch = getCurrentBranch();
  const bottomBranch = getSelectedBranch();

  // Event handlers - only for bottom card
  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start drag if clicking a button
    if ((e.target as HTMLElement).tagName === 'BUTTON') {
      return;
    }

    e.preventDefault();

    // If already dropped, unlock it first
    if (isDropped) {
      setIsDropped(false);
    }

    setIsDragging(true);
    dragStartY.current = e.clientY;
    draggedElementRef.current = e.currentTarget as HTMLElement;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  const handleConfirmImport = () => {
    // Import FROM selected branch INTO current branch
    onSubmit(bottomBranch.name, topBranch.name);
  };

  const renderVersionCard = (branch: any, isDraggable: boolean) => (
    <div
      className={`version-card ${isDraggable ? 'draggable' : 'static'}`}
      onMouseDown={isDraggable ? handleMouseDown : undefined}
      style={{ cursor: isDraggable ? 'grab' : 'default' }}
    >
      <div className="version-header">
        <span className="version-branch">{branch.name}</span>
        <span className="version-timestamp">{branch.timestamp}</span>
        <span className="version-owner">{branch.owner}</span>
      </div>
      <p className="version-commit">{branch.commitMessage}</p>
      <div className="version-actions">
        <button
          className="version-btn version-btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            console.log('Rollback clicked for', branch.name);

            // switch to the branch and rollback
            window.ipcRenderer.invoke('switch-branch', projectName, branch.name).then(() => {
              window.ipcRenderer.invoke('rollback-project-latest', projectName, branch.name);
            });

            console.log('Switched to branch and rolled back to latest commit of', branch.name);

          }}
        >
          Restore this version
        </button>
        <button
          className="version-btn version-btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            console.log('[NOT IMPLEMENTED] Clone clicked for', branch.name);
          }}
        >
          Clone this version
        </button>
      </div>
    </div>
  );

  return (
    <div className="merge-modal-overlay" onClick={onClose}>
      <div className="merge-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose} title="Close">
          <div className="close-dot" />
        </button>

        <h2 className="merge-modal-title">Preview each version before importing</h2>

        {/* Branch Selection */}
        <div className="branch-selection">
          <div className="branch-selector-single">
            <label>Choose branch to import into <strong>{currentBranch}</strong></label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="branch-dropdown"
            >
              {availableBranches.map((branch) => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Cards Container */}
        <div className="merge-cards-container">
          {/* Top Card - Current Branch (not draggable) */}
          {renderVersionCard(topBranch, false)}

          {/* Drop Zone */}
          {isDropped ? (
            <div className="drop-zone drop-zone-filled">
              {renderVersionCard(bottomBranch, true)}
            </div>
          ) : (
            <div
              ref={dropZoneRef}
              className={`drop-zone ${isOverDropZone ? 'active' : ''}`}
            >
              <p className="drop-zone-text">Drag to Import</p>
            </div>
          )}

          {/* Bottom Card - Selected Branch (draggable) */}
          {!isDropped ? (
            renderVersionCard(bottomBranch, true)
          ) : (
            <button className="version-btn version-btn-confirm-slot" onClick={handleConfirmImport}>
              Confirm Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

