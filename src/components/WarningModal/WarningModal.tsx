import React, { useState } from 'react';
import './WarningModal.css';

/**
 * Configuration for a warning action button
 */
interface WarningAction {
    label: string;
    onClick: () => void;
    variant: 'cancel' | 'warning' | 'primary' | 'destructive';
}

/**
 * Props for the reusable WarningModal component
 */
export interface WarningModalProps {
    /** Whether the modal is currently visible */
    isOpen: boolean;
    /** Unique identifier for this warning type, used for config storage */
    warningType: string;
    /** Modal title */
    title: string;
    /** Modal message content */
    message: string | React.ReactNode;
    /** Array of action buttons to display */
    actions: WarningAction[];
    /** Callback when modal is closed/cancelled */
    onCancel: () => void;
    /** Whether to show "Don't ask again" checkbox (default: true) */
    showDontAskAgain?: boolean;
}

/**
 * Reusable warning modal component with "Don't ask again" functionality
 * 
 * Usage:
 * ```tsx
 * <WarningModal
 *   isOpen={showWarning}
 *   warningType="duplicate-commit"
 *   title="No Changes Detected"
 *   message="This commit will be identical to the previous one."
 *   actions={[
 *     { label: 'Cancel', onClick: handleCancel, variant: 'cancel' },
 *     { label: 'Do It Anyway', onClick: handleProceed, variant: 'warning' },
 *   ]}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const WarningModal: React.FC<WarningModalProps> = ({
    isOpen,
    warningType,
    title,
    message,
    actions,
    onCancel,
    showDontAskAgain = true,
}) => {
    const [dontAskAgain, setDontAskAgain] = useState(false);

    if (!isOpen) return null;

    const handleAction = async (action: WarningAction) => {
        if (dontAskAgain) {
            await window.ipcRenderer.invoke('set-warning-preference', warningType, true);
        }
        action.onClick();
    };

    const getButtonClass = (variant: WarningAction['variant']): string => {
        switch (variant) {
            case 'cancel':
                return 'action-btn cancel-btn';
            case 'warning':
                return 'action-btn warning-btn';
            case 'primary':
                return 'action-btn primary-btn';
            case 'destructive':
                return 'action-btn destructive-btn';
            default:
                return 'action-btn';
        }
    };

    return (
        <div className="warning-modal-overlay" onClick={onCancel}>
            <div className="warning-modal-container" onClick={(e) => e.stopPropagation()}>
                <button className="close-button" onClick={onCancel} title="Close">
                    <div className="close-dot" />
                </button>

                <h2 className="warning-modal-title">{title}</h2>

                <div className="warning-modal-message">
                    {typeof message === 'string' ? <p>{message}</p> : message}
                </div>

                {/* Don't ask again checkbox */}
                {showDontAskAgain && (
                    <label className="dont-ask-checkbox">
                        <input
                            type="checkbox"
                            checked={dontAskAgain}
                            onChange={(e) => setDontAskAgain(e.target.checked)}
                        />
                        <span>Don't ask me again</span>
                    </label>
                )}

                {/* Action buttons */}
                <div className="warning-modal-actions">
                    {actions.map((action, index) => (
                        <button
                            key={index}
                            className={getButtonClass(action.variant)}
                            onClick={() => handleAction(action)}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

/**
 * Check if the user has opted to skip a specific warning type
 * @param warningType - The warning type identifier
 * @returns True if the warning should be skipped
 */
export const shouldSkipWarning = async (warningType: string): Promise<boolean> => {
    return await window.ipcRenderer.invoke('should-skip-warning', warningType);
};
