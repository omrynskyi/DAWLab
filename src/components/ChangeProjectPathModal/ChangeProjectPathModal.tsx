import React, { useState } from 'react';
import { FolderIcon, AlertTriangle, Check } from 'lucide-react';
import './ChangeProjectPathModal.css';

interface ChangeProjectPathModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
  projectId: string;
  onPathChanged: () => void;
}

export const ChangeProjectPathModal: React.FC<ChangeProjectPathModalProps> = ({
  isOpen,
  onClose,
  currentPath,
  projectId,
  onPathChanged,
}) => {
  const [selectedPath, setSelectedPath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [hasExistingFiles, setHasExistingFiles] = useState(false);
  const [detectedDAW, setDetectedDAW] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    try {
      if (!window.electronAPI || !window.electronAPI.pickFolder) {
        setError('Folder picker not available');
        return;
      }

      const path = await window.electronAPI.pickFolder();
      if (!path) return;

      setSelectedPath(path);
      setError(null);
      setConfirmChecked(false);

      // Validate the selected folder
      setIsValidating(true);
      try {
        // Check if folder is empty
        const isEmpty = await window.ipcRenderer.invoke('is-folder-empty', path);
        
        if (!isEmpty) {
          setHasExistingFiles(true);
          
          // Also check if it's a DAW project
          const dawResult = await window.ipcRenderer.invoke('detect-daw', path);
          if (dawResult && dawResult.daw && dawResult.isValid) {
            setDetectedDAW(dawResult.daw);
          } else {
            setDetectedDAW(null);
          }
        } else {
          setHasExistingFiles(false);
          setDetectedDAW(null);
        }
      } catch (err) {
        console.error('Error validating folder:', err);
        setHasExistingFiles(false);
        setDetectedDAW(null);
      } finally {
        setIsValidating(false);
      }
    } catch (err) {
      console.error('Error picking folder:', err);
      setError('Failed to select folder');
    }
  };

  const handleConfirm = async () => {
    if (!selectedPath) {
      setError('Please select a folder');
      return;
    }

    if (hasExistingFiles && !confirmChecked) {
      setError('Please confirm that you understand the existing files will be overwritten');
      return;
    }

    try {
      await window.ipcRenderer.invoke('update-project-path', projectId, selectedPath);
      onPathChanged();
      handleClose();
    } catch (err) {
      console.error('Error updating project path:', err);
      setError('Failed to update project path');
    }
  };

  const handleClose = () => {
    setSelectedPath('');
    setHasExistingFiles(false);
    setDetectedDAW(null);
    setConfirmChecked(false);
    setError(null);
    onClose();
  };

  return (
    <div className="change-path-modal-overlay" onClick={handleClose}>
      <div className="change-path-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="close-button" onClick={handleClose} title="Close">
          <div className="close-dot" />
        </button>

        <h2 className="change-path-modal-title">Change Project Path</h2>

        {/* Warning Message */}
        <div className="change-path-warning">
          <AlertTriangle size={18} />
          <p>
            Changing the project path will track a different folder. You'll need to manually 
            restore to get files to the new location.
          </p>
        </div>

        {/* Current Path */}
        <div className="change-path-section">
          <label className="change-path-label">Current Path</label>
          <div className="change-path-display">
            {currentPath.replace(/ /g, '\u00A0').replace(/\//g, '\u200B/')}
          </div>
        </div>

        {/* New Path Selection */}
        <div className="change-path-section">
          <label className="change-path-label">New Path</label>
          <button
            type="button"
            className="change-path-browse-button"
            onClick={handleBrowse}
            disabled={isValidating}
          >
            <span>{selectedPath ? selectedPath.replace(/ /g, '\u00A0').replace(/\//g, '\u200B/') : 'Browse for folder'}</span>
            <FolderIcon size={18} />
          </button>
        </div>

        {/* Existing Files Warning */}
        {hasExistingFiles && (
          <div className="change-path-existing-warning">
            <AlertTriangle size={18} color="#ef4444" />
            <div className="change-path-existing-content">
              <p>
                <strong>Warning:</strong> This folder contains existing files{detectedDAW && ` (${detectedDAW} project detected)`}. 
                When you restore, the contents of this folder will be replaced with files from 
                your selected version.
              </p>
              <label className="change-path-checkbox-label" onClick={() => setConfirmChecked(!confirmChecked)}>
                <div className={`change-path-custom-checkbox ${confirmChecked ? 'checked' : ''}`}>
                  {confirmChecked && <Check size={14} strokeWidth={3} />}
                </div>
                <span>I understand that the existing files will be overwritten</span>
              </label>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="change-path-error">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="change-path-actions">
          <button
            type="button"
            className="change-path-button secondary"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="change-path-button primary"
            onClick={handleConfirm}
            disabled={!selectedPath || isValidating || (hasExistingFiles && !confirmChecked)}
          >
            {isValidating ? 'Validating...' : 'Change Path'}
          </button>
        </div>
      </div>
    </div>
  );
};
