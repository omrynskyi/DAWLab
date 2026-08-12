import React, { useState } from 'react';
import { FolderIcon } from 'lucide-react';
import './NewProject/NewProject.css'; // Reusing existing styles
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface PathSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (path: string, setLoading: (loading: boolean) => void) => void;
}

export const PathSelectionModal: React.FC<PathSelectionModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [tempProjectPath, setTempProjectPath] = useState('');
    const [pathError, setPathError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleBrowsePath = async () => {
        try {
            if (!window.electronAPI || !window.electronAPI.pickFolder) {
                console.error('electronAPI.pickFolder not available');
                setPathError('Folder picker not available');
                return;
            }

            const path = await window.electronAPI.pickFolder();
            if (path) {
                setTempProjectPath(path);
                setPathError(null);
            }
        } catch (err) {
            console.error('Error picking folder:', err);
            setPathError('Failed to select folder');
        }
    };

    const handleConfirm = () => {
        if (!tempProjectPath) {
            setPathError('Please select a path');
            return;
        }
        setIsLoading(true);
        onConfirm(tempProjectPath, setIsLoading);
        // Note: Don't reset state here - let the caller handle completion
    };

    const handleCancel = () => {
        if (isLoading) return; // Prevent closing while loading
        setTempProjectPath('');
        setPathError(null);
        onClose();
    };

    return (
        <div className="new-project-modal-overlay" onClick={handleCancel}>
            <div 
                className="path-selection-container" 
                onClick={(e) => e.stopPropagation()} 
                style={{ 
                    position: 'relative',
                    width: '600px',
                    maxHeight: '90vh',
                    height: 'auto',
                    background: 'var(--bg-card)',
                    borderRadius: '20px',
                    padding: '3rem',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
                    animation: 'slideUp 0.3s ease-out',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Loading Overlay */}
                {isLoading && (
                    <LoadingSpinner
                        variant="overlay"
                        message="Downloading project..."
                        submessage="This may take a moment"
                    />
                )}
                {/* Close Button */}
                <button className="close-button" onClick={handleCancel} title="Close" disabled={isLoading} style={{ opacity: isLoading ? 0.5 : 1 }}>
                    <div className="close-dot" />
                </button>

                <div className="new-project-form">
                    <h2 className="text-xl font-bold text-white mb-4">Select Project Location</h2>
                    <p className="text-gray-400 mb-6">
                        DAWLab will create your project in the selected directory. We recommend creating a dedicated folder for DAWLab projects, but you can also select your existing project folder.
                    </p>

                    {/* Select Project Path */}
                    <div className="form-section">
                        <label className="section-label">Project Path</label>
                        <button
                            type="button"
                            className="browse-button"
                            onClick={handleBrowsePath}
                        >
                            <span>{tempProjectPath || 'Browse'}</span>
                            <FolderIcon size={18} />
                        </button>
                    </div>

                    {/* Error Message */}
                    {pathError && (
                        <div className="error-message">
                            {pathError}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="form-actions">
                        <button
                            type="button"
                            className="action-button secondary"
                            onClick={handleCancel}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="action-button primary"
                            onClick={handleConfirm}
                            disabled={isLoading}
                            style={{ opacity: isLoading ? 0.7 : 1, minWidth: '160px' }}
                        >
                            {isLoading ? (
                                <LoadingSpinner variant="button" buttonText="Downloading..." />
                            ) : (
                                'Download & Checkout'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
