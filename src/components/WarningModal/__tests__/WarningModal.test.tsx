import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WarningModal } from '../WarningModal';

describe('WarningModal', () => {
    const mockIpcRenderer = {
        invoke: vi.fn(),
    };

    beforeEach(() => {
        vi.stubGlobal('ipcRenderer', mockIpcRenderer);
        Object.defineProperty(window, 'ipcRenderer', { value: mockIpcRenderer, writable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders correctly', () => {
        render(
            <WarningModal
                isOpen={true}
                warningType="test"
                title="Warning Title"
                message="Warning Message"
                actions={[]}
                onCancel={() => { }}
            />
        );
        expect(screen.getByText('Warning Title')).toBeInTheDocument();
        expect(screen.getByText('Warning Message')).toBeInTheDocument();
    });

    it('executes action', async () => {
        const onAction = vi.fn();
        render(
            <WarningModal
                isOpen={true}
                warningType="test"
                title="Warning"
                message="Msg"
                actions={[{ label: 'Do It', onClick: onAction, variant: 'primary' }]}
                onCancel={() => { }}
            />
        );

        fireEvent.click(screen.getByText('Do It'));
        await waitFor(() => {
            expect(onAction).toHaveBeenCalled();
        });
    });

    it('sets preference if "dont ask again" checked', async () => {
        const onAction = vi.fn();
        render(
            <WarningModal
                isOpen={true}
                warningType="test-warning"
                title="Warning"
                message="Msg"
                actions={[{ label: 'Do It', onClick: onAction, variant: 'primary' }]}
                onCancel={() => { }}
            />
        );

        const checkbox = screen.getByLabelText("Don't ask me again");
        fireEvent.click(checkbox);
        fireEvent.click(screen.getByText('Do It'));

        await waitFor(() => {
            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('set-warning-preference', 'test-warning', true);
            expect(onAction).toHaveBeenCalled();
        });
    });
});
