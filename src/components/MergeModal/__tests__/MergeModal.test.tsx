import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MergeModal } from '../MergeModal';

describe('MergeModal', () => {
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

    it('loads project log on open', async () => {
        mockIpcRenderer.invoke.mockResolvedValue({
            branches: [
                { name: 'main', commits: [] },
                { name: 'feature', commits: [] }
            ],
            current_branch: 'main'
        });

        render(
            <MergeModal
                isOpen={true}
                onClose={() => { }}
                onSubmit={() => { }}
                projectName="TestProject"
                projectId="1"
            />
        );

        await waitFor(() => {
            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-project-log', 'TestProject', '1');
        });

        await waitFor(() => {
            expect(screen.getByText('Preview each version before importing')).toBeInTheDocument();
        });
        expect(screen.getAllByText('main')[0]).toBeInTheDocument();
    });

    it('shows error if not enough branches', async () => {
        mockIpcRenderer.invoke.mockResolvedValue({
            branches: [
                { name: 'main', commits: [] }
            ],
            current_branch: 'main'
        });

        render(
            <MergeModal
                isOpen={true}
                onClose={() => { }}
                onSubmit={() => { }}
                projectName="TestProject"
                projectId="1"
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Cannot Import')).toBeInTheDocument();
        });
    });
});
