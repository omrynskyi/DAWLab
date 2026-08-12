import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StorageWarningModal } from '../StorageWarningModal';

describe('StorageWarningModal', () => {
    it('does not render when isOpen is false', () => {
        render(<StorageWarningModal isOpen={false} onClose={() => { }} />);
        expect(screen.queryByText('Storage Limit Reached')).not.toBeInTheDocument();
    });

    it('renders correctly when isOpen is true', () => {
        render(<StorageWarningModal isOpen={true} onClose={() => { }} />);
        expect(screen.getByText('Storage Limit Reached')).toBeInTheDocument();
        expect(screen.getByText("You've reached your local storage limit.")).toBeInTheDocument();
    });

    it('renders custom title and message', () => {
        const title = 'Custom Title';
        const message = 'Custom Message';
        render(<StorageWarningModal isOpen={true} onClose={() => { }} title={title} message={message} />);
        expect(screen.getByText(title)).toBeInTheDocument();
        expect(screen.getByText(message)).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
        const onClose = vi.fn();
        render(<StorageWarningModal isOpen={true} onClose={onClose} />);
        fireEvent.click(screen.getByText('Cancel Download'));
        expect(onClose).toHaveBeenCalled();
    });

    it('renders "Adjust in Settings" button when onManageSettings is provided', () => {
        const onManageSettings = vi.fn();
        render(<StorageWarningModal isOpen={true} onClose={() => { }} onManageSettings={onManageSettings} />);

        const button = screen.getByText('Adjust in Settings');
        expect(button).toBeInTheDocument();
        fireEvent.click(button);
        expect(onManageSettings).toHaveBeenCalled();
    });

    it('renders "Continue Downloading" button when onProceedAnyway is provided', () => {
        const onProceedAnyway = vi.fn();
        render(<StorageWarningModal isOpen={true} onClose={() => { }} onProceedAnyway={onProceedAnyway} />);

        const button = screen.getByText('Continue Downloading');
        expect(button).toBeInTheDocument();
        fireEvent.click(button);
        expect(onProceedAnyway).toHaveBeenCalled();
    });
});
