import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangeProjectPathModal } from '../ChangeProjectPathModal';

describe('ChangeProjectPathModal', () => {
    const mockElectronAPI = {
        pickFolder: vi.fn(),
    };

    const mockIpcRenderer = {
        invoke: vi.fn(),
    };

    beforeEach(() => {
        vi.stubGlobal('electronAPI', mockElectronAPI);
        vi.stubGlobal('ipcRenderer', mockIpcRenderer);
        Object.defineProperty(window, 'electronAPI', { value: mockElectronAPI, writable: true });
        Object.defineProperty(window, 'ipcRenderer', { value: mockIpcRenderer, writable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not render when closed', () => {
        render(
            <ChangeProjectPathModal
                isOpen={false}
                onClose={() => { }}
                currentPath="/old/path"
                projectId="1"
                onPathChanged={() => { }}
            />
        );
        expect(screen.queryByText('Change Project Path')).not.toBeInTheDocument();
    });

    it('renders correctly when open', () => {
        render(
            <ChangeProjectPathModal
                isOpen={true}
                onClose={() => { }}
                currentPath="/old/path"
                projectId="1"
                onPathChanged={() => { }}
            />
        );
        expect(screen.getByText('Change Project Path')).toBeInTheDocument();
        expect(screen.getByText((content) => content.replace(/\u200b/g, '') === '/old/path')).toBeInTheDocument();
    });

    it('handles folder browsing and selection', async () => {
        mockElectronAPI.pickFolder.mockResolvedValue('/new/path');
        mockIpcRenderer.invoke.mockResolvedValue(true); // is-folder-empty returns true

        render(
            <ChangeProjectPathModal
                isOpen={true}
                onClose={() => { }}
                currentPath="/old/path"
                projectId="1"
                onPathChanged={() => { }}
            />
        );

        const browseBtn = screen.getByText((content) => content.includes('Browse for folder'));
        fireEvent.click(browseBtn);

        await waitFor(() => {
            expect(mockElectronAPI.pickFolder).toHaveBeenCalled();
        });

        // Wait for UI to update with new path
        await waitFor(() => {
            expect(screen.getByText((content) => content.replace(/\u200b/g, '') === '/new/path')).toBeInTheDocument();
        });
    });
});
