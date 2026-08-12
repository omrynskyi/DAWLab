import React, { useState, useEffect } from 'react';
import { Eye } from 'lucide-react';
import './PreviewNotification.css';

interface PreviewNotificationProps {
    className?: string;
}

export const PreviewNotification: React.FC<PreviewNotificationProps> = ({ className = '' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [commitId, setCommitId] = useState('');

    useEffect(() => {
        const handlePreviewStart = (_event: CustomEvent) => {
            const detail = _event.detail;
            setCommitId(detail.commitId);
            setMessage('Preparing preview...');
            setIsVisible(true);
        };

        const handlePreviewStatus = (_event: CustomEvent) => {
            setMessage(_event.detail.status);
        };

        const handlePreviewComplete = () => {
            // Auto-dismiss after a short delay
            setTimeout(() => {
                setIsVisible(false);
            }, 1500);
        };

        window.addEventListener('preview-start' as any, handlePreviewStart);
        window.addEventListener('preview-status-update' as any, handlePreviewStatus);
        window.addEventListener('preview-complete' as any, handlePreviewComplete);

        return () => {
            window.removeEventListener('preview-start' as any, handlePreviewStart);
            window.removeEventListener('preview-status-update' as any, handlePreviewStatus);
            window.removeEventListener('preview-complete' as any, handlePreviewComplete);
        };
    }, []);

    if (!isVisible) return null;

    return (
        <div className={`preview-notification-container ${className}`}>
            <div className="invitation-notification preview-card">
                <div className="invitation-content">
                    {/* Left side - info */}
                    <div className="invitation-info">
                        <div className="invitation-label">
                            <span className="text-muted">Previewing</span>
                            <Eye size={12} style={{ opacity: 0.6 }} />
                        </div>
                        <div className="project-title">
                            Version Preview
                        </div>
                        <div className="expires-info">
                            {message}
                        </div>
                        {commitId && (
                            <div className="preview-commit-id">
                                Commit: {String(commitId).substring(0, 8)}...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
