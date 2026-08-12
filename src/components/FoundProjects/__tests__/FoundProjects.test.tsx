import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FoundProjectsBanner, FoundProjectsPanel } from '../FoundProjects';
import type { FoundProject } from '../FoundProjects';

// Resolve the username synchronously so the Add flow isn't racing an effect.
vi.mock('@/hooks/useUsername', () => ({
  useUsername: () => ({ username: 'testuser', loading: false, setUsername: vi.fn() }),
}));

const project = (over: Partial<FoundProject> = {}): FoundProject => ({
  path: '/music/Song',
  name: 'Song',
  dawType: 'FL Studio',
  primaryFile: 'Song.flp',
  candidates: ['Song.flp'],
  alreadyImported: false,
  ...over,
});

describe('FoundProjectsBanner', () => {
  it('shows the count and pluralizes, and wires review/dismiss separately', () => {
    const onReview = vi.fn();
    const onDismiss = vi.fn();
    render(<FoundProjectsBanner count={3} onReview={onReview} onDismiss={onDismiss} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/new projects found/i)).toBeInTheDocument();

    // Dismiss must not bubble up to the banner's review handler.
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Review'));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it('uses the singular form for a single project', () => {
    render(<FoundProjectsBanner count={1} onReview={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/new project found/i)).toBeInTheDocument();
    expect(screen.queryByText(/new projects found/i)).not.toBeInTheDocument();
  });
});

describe('FoundProjectsPanel', () => {
  const mockInvoke = vi.fn();

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'get-username') return Promise.resolve('testuser');
      if (channel === 'get-default-storage-mode') return Promise.resolve('home');
      return Promise.resolve({ success: true });
    });
    Object.defineProperty(window, 'ipcRenderer', {
      value: { invoke: mockInvoke, on: vi.fn(), off: vi.fn(), removeAllListeners: vi.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a row per found project with its name, DAW, and path', () => {
    render(
      <FoundProjectsPanel
        projects={[project(), project({ path: '/beats/Trap', name: 'Trap', dawType: 'Ableton Live' })]}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    expect(screen.getByText('Song')).toBeInTheDocument();
    expect(screen.getByText('FL Studio')).toBeInTheDocument();
    expect(screen.getByText('Trap')).toBeInTheDocument();
    expect(screen.getByText('Ableton Live')).toBeInTheDocument();
    expect(screen.getByText(/2 new projects found/i)).toBeInTheDocument();
  });

  it('imports a project on Add with the resolved author, storage mode, and primary file', async () => {
    const onRemove = vi.fn();
    const onAdded = vi.fn();
    render(
      <FoundProjectsPanel
        projects={[project()]}
        onClose={vi.fn()}
        onRemove={onRemove}
        onAdded={onAdded}
      />,
    );

    fireEvent.click(screen.getByText('Add'));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('init-project', 'Song', '/music/Song', {
        author: 'testuser',
        storageMode: 'home',
        primaryFile: 'Song.flp',
      }),
    );
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('/music/Song'));
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('auto-suffixes the name when one already exists, then succeeds', async () => {
    const onRemove = vi.fn();
    let initCalls = 0;
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'get-username') return Promise.resolve('testuser');
      if (channel === 'get-default-storage-mode') return Promise.resolve('home');
      if (channel === 'init-project') {
        initCalls++;
        if (initCalls === 1) {
          return Promise.reject(new Error('Project "Song" already exists at: /elsewhere'));
        }
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    });

    render(
      <FoundProjectsPanel projects={[project()]} onClose={vi.fn()} onRemove={onRemove} onAdded={vi.fn()} />,
    );

    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('/music/Song'));
    const initNames = mockInvoke.mock.calls
      .filter((c) => c[0] === 'init-project')
      .map((c) => c[1]);
    expect(initNames).toEqual(['Song', 'Song 2']);
  });

  it('surfaces an error and keeps the project when the add fails for another reason', async () => {
    const onRemove = vi.fn();
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'get-username') return Promise.resolve('testuser');
      if (channel === 'get-default-storage-mode') return Promise.resolve('home');
      if (channel === 'init-project') return Promise.reject(new Error('Invalid project path'));
      return Promise.resolve({ success: true });
    });

    render(
      <FoundProjectsPanel projects={[project()]} onClose={vi.fn()} onRemove={onRemove} onAdded={vi.fn()} />,
    );

    fireEvent.click(screen.getByText('Add'));

    await waitFor(() => expect(screen.getByText('Invalid project path')).toBeInTheDocument());
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('dismisses a project on Ignore without importing it', async () => {
    const onRemove = vi.fn();
    const onAdded = vi.fn();
    render(
      <FoundProjectsPanel projects={[project()]} onClose={vi.fn()} onRemove={onRemove} onAdded={onAdded} />,
    );

    fireEvent.click(screen.getByText('Ignore'));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('ignore-found-project', '/music/Song'),
    );
    expect(onRemove).toHaveBeenCalledWith('/music/Song');
    expect(mockInvoke).not.toHaveBeenCalledWith(
      'init-project',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('adds every project when Add all is clicked', async () => {
    const onAdded = vi.fn();
    render(
      <FoundProjectsPanel
        projects={[project(), project({ path: '/beats/Trap', name: 'Trap' })]}
        onClose={vi.fn()}
        onRemove={vi.fn()}
        onAdded={onAdded}
      />,
    );

    fireEvent.click(screen.getByText('Add all'));

    await waitFor(() => {
      const inits = mockInvoke.mock.calls.filter((c) => c[0] === 'init-project').map((c) => c[1]);
      expect(inits).toEqual(['Song', 'Trap']);
    });
  });

  it('closes when the overlay backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FoundProjectsPanel projects={[project()]} onClose={onClose} onRemove={vi.fn()} onAdded={vi.fn()} />,
    );

    fireEvent.click(container.querySelector('.found-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
