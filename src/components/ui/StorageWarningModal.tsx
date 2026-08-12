import React from 'react';
import { TriangleAlert } from 'lucide-react';
import './StorageWarningModal.css';

interface StorageWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
  title?: string;
  onManageSettings?: () => void;
  onProceedAnyway?: () => void;
  onUpgrade?: () => void;
}

export const StorageWarningModal: React.FC<StorageWarningModalProps> = ({ 
  isOpen, 
  onClose, 
  message = "You've reached your local storage limit.",
  title = "Storage Limit Reached",
  onManageSettings,
  onProceedAnyway,
  onUpgrade
}) => {
  if (!isOpen) return null;

  return (
    <div className="storage-modal-overlay" onClick={onClose}>
      <div className="storage-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="storage-modal-icon-wrapper">
          <div className="storage-modal-icon">
            <TriangleAlert size={32} />
          </div>
        </div>
        
        <h2 className="storage-modal-title">{title}</h2>
        
        <p className="storage-modal-message">
          {message}
        </p>
        
        <div className="storage-modal-actions">
          {onUpgrade && (
            <button className="storage-btn storage-btn-primary" onClick={onUpgrade}>
              Upgrade Plan
            </button>
          )}

          {onManageSettings && (
            <button className="storage-btn storage-btn-primary" onClick={onManageSettings}>
              Adjust in Settings
            </button>
          )}

          {onProceedAnyway && (
             <button className="storage-btn storage-btn-secondary" onClick={onProceedAnyway}>
               Continue Downloading
             </button>
          )}

          <button className="storage-btn storage-btn-ghost" onClick={onClose}>
            Cancel Download
          </button>
        </div>
      </div>
    </div>
  );
};
