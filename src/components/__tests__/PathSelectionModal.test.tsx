import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PathSelectionModal } from '../PathSelectionModal';

describe('PathSelectionModal', () => {
    const mockElectronAPI = {
        pickFolder: vi.fn(),
    };

    beforeEach(() => {
        vi.stubGlobal('electronAPI', mockElectronAPI);
        Object.defineProperty(window, 'electronAPI', { value: mockElectronAPI, writable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders correctly when open', () => {
        render(<PathSelectionModal isOpen={true} onClose={() => { }} onConfirm={() => { }} />);
        expect(screen.getByText('Select Project Location')).toBeInTheDocument();
    });

    it('handles browse and confirm', async () => {
        mockElectronAPI.pickFolder.mockResolvedValue('/selected/path');
        const onConfirm = vi.fn();

        render(<PathSelectionModal isOpen={true} onClose={() => { }} onConfirm={onConfirm} />);

        fireEvent.click(screen.getByText('Browse'));
        await waitFor(() => expect(mockElectronAPI.pickFolder).toHaveBeenCalled());

        expect(screen.getByText('/selected/path')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Download & Checkout'));
        expect(onConfirm).toHaveBeenCalled();
    });
});
