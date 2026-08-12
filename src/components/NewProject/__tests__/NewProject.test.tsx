import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewProject } from '../NewProject';

// Mock motion
vi.mock('motion/react', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('NewProject', () => {
    const mockElectronAPI = {
        pickFolder: vi.fn(),
    };
    const mockIpcRenderer = {
        invoke: vi.fn(),
    };

    beforeEach(() => {
        mockIpcRenderer.invoke.mockResolvedValue('testuser');
        // Fix window mocking
        vi.stubGlobal('electronAPI', mockElectronAPI);
        vi.stubGlobal('ipcRenderer', mockIpcRenderer);
        Object.defineProperty(window, 'electronAPI', { value: mockElectronAPI, writable: true });
        Object.defineProperty(window, 'ipcRenderer', { value: mockIpcRenderer, writable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders correctly', () => {
        render(<NewProject isOpen={true} onClose={() => { }} />);
        expect(screen.getByText(/Confirm/i)).toBeInTheDocument();
    });

    it('navigates to form step', async () => {
        render(<NewProject isOpen={true} onClose={() => { }} />);
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            expect(screen.getByPlaceholderText('Project Name')).toBeInTheDocument();
        });
    });

    it('creates project successfully', async () => {
        const onSuccess = vi.fn();
        mockElectronAPI.pickFolder.mockResolvedValue('/project/path');
        mockIpcRenderer.invoke.mockImplementation((channel: string) => {
            if (channel === 'get-username') return Promise.resolve('testuser');
            return Promise.resolve({ success: true, projectId: 123 });
        });

        render(<NewProject isOpen={true} onClose={() => { }} onSuccess={onSuccess} />);

        // Go to step 2
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            expect(screen.getByPlaceholderText('Project Name')).toBeInTheDocument();
        });

        // Fill form
        const nameInput = screen.getByPlaceholderText('Project Name');
        fireEvent.change(nameInput, { target: { value: 'My Project' } });

        // Pick folder
        fireEvent.click(screen.getByText('Browse'));

        await waitFor(() => expect(mockElectronAPI.pickFolder).toHaveBeenCalled());

        await waitFor(() => {
            expect(screen.getByText(/\/project\/path/)).toBeInTheDocument();
        });

        // Submit
        fireEvent.click(screen.getByText('Create Project'));

        await waitFor(() => {
            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
                'init-project',
                'My Project',
                '/project/path',
                expect.objectContaining({
                    author: 'testuser',
                }),
            );
            expect(onSuccess).toHaveBeenCalled();
        });
    });
});
