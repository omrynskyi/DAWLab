import './InputModal.css';

interface InputModalProps {
    isOpen: boolean;
    title: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onClose: () => void;
    placeholder?: string;
    submitText?: string;
    cancelText?: string;
    isLoading?: boolean;
    loadingText?: string;
}

export const InputModal = ({
    isOpen,
    title: _title,
    label,
    value,
    onChange,
    onSubmit,
    onClose,
    placeholder = 'Enter value',
    submitText = 'Submit',
    cancelText = 'Cancel',
    isLoading = false,
    loadingText = 'Loading...',
}: InputModalProps) => {
    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLoading) {
            onSubmit();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={onClose} aria-label="Close" />
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-field">
                        <label>{label} <span className="required">*</span></label>
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder}
                            required
                            autoFocus
                            disabled={isLoading}
                        />
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>
                            {cancelText}
                        </button>
                        <button type="submit" className="btn-primary" disabled={isLoading}>
                            {isLoading ? loadingText : submitText}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
