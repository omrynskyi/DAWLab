import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuickLook } from '../QuickLook';

const base = {
  title: 'Night Drive',
  icon: <span>icon</span>,
  details: [{ label: 'BPM', value: '128' }],
  commit: { id: 'abcdef1234', message: 'Rework the drop', date: 'Jan 2, 2026 3:04 pm' },
  isPlaying: false,
  isLoading: false,
  onTogglePlay: vi.fn(),
  onSeek: vi.fn(),
  getElement: () => null,
  onClose: vi.fn(),
};

describe('QuickLook', () => {
  it('shows the name, commit message, short commit id and details', () => {
    render(<QuickLook {...base} />);
    expect(screen.getByText('Night Drive')).toBeInTheDocument();
    expect(screen.getByText('Rework the drop')).toBeInTheDocument();
    expect(screen.getByText(/abcdef1 · Jan 2, 2026/)).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('falls back when the commit has no message', () => {
    render(<QuickLook {...base} commit={{ id: 'abcdef1234', message: null, date: null }} />);
    expect(screen.getByText('No commit message')).toBeInTheDocument();
  });

  it('play button reflects state and toggles', () => {
    const onTogglePlay = vi.fn();
    const { rerender } = render(<QuickLook {...base} onTogglePlay={onTogglePlay} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    rerender(<QuickLook {...base} onTogglePlay={onTogglePlay} isPlaying />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('closes on Escape, the close button and a backdrop click, but not a panel click', () => {
    const onClose = vi.fn();
    const { container } = render(<QuickLook {...base} onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.querySelector('.quick-look-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
