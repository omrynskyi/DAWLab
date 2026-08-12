import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectSettings } from '../ProjectSettings';
import { BrowserRouter } from 'react-router-dom';

describe('ProjectSettings', () => {
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

    it('loads and renders project details', async () => {
        mockIpcRenderer.invoke.mockResolvedValue({
            genre: 'Rock',
            daw: 'Logic Pro',
            description: 'A rock song',
            bpm: 120,
        });

        render(
            <BrowserRouter>
                <ProjectSettings projectId="1" projectName="Test Project" onBack={() => { }} />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('Rock')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Logic Pro')).toBeInTheDocument();
        });
    });
});
