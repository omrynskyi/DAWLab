import React, { useState, useEffect } from 'react';
import { ChevronUp, Download } from 'lucide-react';
import { ActionButton } from '../ui/ActionButton';
import { checkVersion, VersionCheckResult } from '../../utils/versionCheck';
import './ActivityPanel.css';

interface ActivityPanelProps {
    className?: string;
    embedded?: boolean;
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({ className = '', embedded = false }) => {
    const [isCollapsed, setIsCollapsed] = useState(embedded);
    const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
    const [versionDismissed, setVersionDismissed] = useState(() => {
        return sessionStorage.getItem('version-notification-dismissed') === 'true';
    });

    useEffect(() => {
        if (embedded) setIsCollapsed(true);
    }, [embedded]);

    useEffect(() => {
        checkVersion().then(setVersionInfo);
    }, []);

    const handleDismissVersion = () => {
        setVersionDismissed(true);
        sessionStorage.setItem('version-notification-dismissed', 'true');
    };

    const handleUpdateNow = () => {
        window.open('https://drive.google.com/drive/u/0/folders/1mgWYalv7KoZOGRuv3MlhcTcm4LdLfr-n', '_blank');
    };

    const showVersionNotification = versionInfo?.isOutdated && !versionDismissed;

    if (!showVersionNotification) return null;

    if (isCollapsed) {
        return (
            <div className={`activity-collapsed-tab ${embedded ? 'embedded' : ''} ${className}`}>
                <button
                    className="activity-tab-button"
                    onClick={() => setIsCollapsed(false)}
                >
                    <span className="activity-badge">1</span>
                    Activity
                    <ChevronUp size={14} className="activity-tab-chevron" />
                </button>
            </div>
        );
    }

    return (
        <div className={`activity-floating-container ${embedded ? 'embedded' : ''} ${className}`}>
            {embedded && (
                <button
                    className="activity-tab-button"
                    onClick={() => setIsCollapsed(true)}
                >
                    <span className="activity-badge">1</span>
                    Activity
                    <ChevronUp size={14} style={{ transform: 'rotate(180deg)' }} className="activity-tab-chevron" />
                </button>
            )}

            {!embedded && (
                <button
                    className="activity-collapse-btn"
                    onClick={() => setIsCollapsed(true)}
                    title="Collapse activity"
                >
                    Collapse
                </button>
            )}

            <div className="activity-cards-stack">
                <div className="invitation-notification version-update">
                    <div className="invitation-content">
                        <div className="invitation-info">
                            <div className="invitation-label">
                                <span className="text-muted">Update available</span>
                                <Download size={12} style={{ opacity: 0.6 }} />
                            </div>
                            <div className="project-title">
                                <span className="project-name-text">New version {versionInfo!.latestVersion}</span>
                            </div>
                            <div className="expires-info">
                                You're on v{versionInfo!.currentVersion}
                            </div>
                        </div>
                        <div className="invitation-actions">
                            <ActionButton variant="save" onClick={handleUpdateNow}>
                                Update Now
                            </ActionButton>
                            <ActionButton variant="destructive" onClick={handleDismissVersion}>
                                Dismiss
                            </ActionButton>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
