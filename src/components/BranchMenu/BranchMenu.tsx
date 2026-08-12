import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CornerDownRight, Plus, Command } from 'lucide-react';
import './BranchMenu.css';
import { Branch } from '@/types/project.types';

interface BranchMenuProps {
  branches: Branch[];
  selectedBranch: string;
  onSwitchBranch: (name: string) => void;
  onCreateBranch: (name: string) => void;
  onClose: () => void;
  error?: string | null;
  isCreating?: boolean;
}

/**
 * Format timestamp to a human-readable "last edited" string
 * @param timestamp YYYYMMDDHHmmss
 */
const formatLastEdited = (timestamp: string): string => {
  if (!timestamp || timestamp.length < 12) return 'no edits yet';

  const year = parseInt(timestamp.slice(0, 4));
  const month = parseInt(timestamp.slice(4, 6)) - 1;
  const day = parseInt(timestamp.slice(6, 8));
  const hour = parseInt(timestamp.slice(8, 10));
  const minute = parseInt(timestamp.slice(10, 12));
  
  const editDate = new Date(year, month, day, hour, minute);
  const now = new Date();
  
  const diffInMinutes = Math.floor((now.getTime() - editDate.getTime()) / (1000 * 60));

  if (diffInMinutes < 60) return 'just now';
  
  const monthName = editDate.toLocaleString('en-US', { month: 'short' });
  const dayNum = editDate.getDate();
  const suffix = (dayNum: number) => {
    if (dayNum >= 11 && dayNum <= 13) return 'th';
    switch (dayNum % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  
  const timeStr = editDate.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase();

  return `${monthName} ${dayNum}${suffix(dayNum)} ${timeStr}`;
};

export const BranchMenu: React.FC<BranchMenuProps> = ({
  branches,
  selectedBranch,
  onSwitchBranch,
  onCreateBranch,
  onClose,
  error,
  isCreating: isCreatingFromProp
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newBranchInput, setNewBranchInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus input on mount and on ⌘K
  useEffect(() => {
    inputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (showCreateInput) {
      createInputRef.current?.focus();
    }
  }, [showCreateInput]);

  const currentBranchData = useMemo(() => {
    return branches.find(b => b.name === selectedBranch);
  }, [branches, selectedBranch]);

  const filteredBranches = useMemo(() => {
    return branches
      .filter(b => b.name !== selectedBranch)
      .filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [branches, selectedBranch, searchQuery]);

  const getLatestCommitTimestamp = (branch: Branch): string => {
    if (!branch.commits || branch.commits.length === 0) return '';
    // Commits are assumed to be chronological or we sort them
    const sorted = [...branch.commits].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return sorted[0].timestamp;
  };

  return (
    <div className="branch-menu-overlay" onClick={onClose}>
      <div 
        className="branch-menu-container" 
        onClick={e => e.stopPropagation()}
        ref={menuRef}
      >
        <div className="branch-menu-search">
          <input
            ref={inputRef}
            type="text"
            placeholder="Find or create an alternative..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div className="shortcut-hint">
            <Command size={14} /> K
          </div>
        </div>

        <div className="branch-menu-content">
          <div className="menu-section">
            <h3 className="section-title">CURRENT ALTERNATIVE</h3>
            <div className="branch-item active">
              <div className="branch-info">
                <span className="branch-name">{selectedBranch}</span>
                <span className="last-edited">
                  last edited: {currentBranchData ? formatLastEdited(getLatestCommitTimestamp(currentBranchData)) : 'just now'}
                </span>
              </div>
            </div>
          </div>

          <div className="menu-section">
            <h3 className="section-title">PROJECT ALTERNATIVES</h3>
            <div className="branch-list">
              {filteredBranches.map(branch => (
                <div 
                  key={branch.name}
                  className="branch-item"
                  onClick={() => onSwitchBranch(branch.name)}
                >
                  <div className="branch-info">
                    <span className="branch-name">{branch.name}</span>
                    <span className="last-edited">
                      last edited: {formatLastEdited(getLatestCommitTimestamp(branch))}
                    </span>
                  </div>
                  <CornerDownRight size={18} className="switch-icon" />
                </div>
              ))}
              {filteredBranches.length === 0 && searchQuery && (
                <div className="no-results">No alternatives found matching "{searchQuery}"</div>
              )}
            </div>
          </div>

          <div className="menu-footer">
            {error && (
              <div className="error-message">{error}</div>
            )}
            {isCreatingFromProp ? (
              <div className="creating-branch-loader">
                <span className="loader-text">Please wait while we create your alternative...</span>
              </div>
            ) : showCreateInput ? (
              <div className="create-branch-input-container">
                <input
                  ref={createInputRef}
                  type="text"
                  placeholder="New alternative name..."
                  value={newBranchInput}
                  onChange={e => setNewBranchInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newBranchInput.trim()) {
                      onCreateBranch(newBranchInput.trim());
                    } else if (e.key === 'Escape') {
                      setShowCreateInput(false);
                      setNewBranchInput('');
                    }
                  }}
                  onBlur={() => {
                    if (!newBranchInput.trim()) {
                      setShowCreateInput(false);
                    }
                  }}
                  className="create-branch-input"
                />
                <div className="create-hint">Press Enter to create</div>
              </div>
            ) : (
              <button className="create-branch-btn" onClick={() => setShowCreateInput(true)}>
                <div className="btn-content">
                  <div className="btn-text">
                    <span className="btn-title">Create a new alternative</span>
                    <span className="btn-subtitle">Alternative from <strong>{selectedBranch}</strong></span>
                  </div>
                  <div className="plus-icon-container">
                    <Plus size={20} />
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
