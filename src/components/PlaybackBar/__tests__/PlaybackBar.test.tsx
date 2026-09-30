import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlaybackBar } from '../PlaybackBar';

const makeAudio = (over: Partial<{ currentTime: number; duration: number; paused: boolean }> = {}) => {
  const el = new EventTarget() as EventTarget & { currentTime: number; duration: number; paused: boolean };
  Object.assign(el, { currentTime: 30, duration: 120, paused: true }, over);
  return el as unknown as HTMLAudioElement & EventTarget;
};

describe('PlaybackBar', () => {
  it('renders elapsed and remaining time in the panel variant', () => {
    const el = makeAudio();
    render(<PlaybackBar variant="panel" getElement={() => el} />);
    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('-1:30')).toBeInTheDocument();
  });

  it('follows the element on media events', () => {
    const el = makeAudio({ currentTime: 0 });
    render(<PlaybackBar variant="panel" getElement={() => el} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
    act(() => {
      (el as any).currentTime = 60;
      el.dispatchEvent(new Event('timeupdate'));
    });
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('shows placeholders until the duration is known', () => {
    const el = makeAudio({ duration: NaN });
    render(<PlaybackBar variant="panel" getElement={() => el} />);
    expect(screen.getByText('--:--')).toBeInTheDocument();
  });

  it('seeks with the arrow keys', () => {
    const el = makeAudio();
    const onSeek = vi.fn();
    render(<PlaybackBar variant="panel" getElement={() => el} onSeek={onSeek} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenLastCalledWith(35);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onSeek).toHaveBeenLastCalledWith(25);
  });

  it('shows a time tooltip under the cursor and seeks on click', () => {
    const el = makeAudio();
    const onSeek = vi.fn();
    render(<PlaybackBar variant="panel" getElement={() => el} onSeek={onSeek} />);
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 8, height: 8, x: 0, y: 0, toJSON() {} });
    slider.setPointerCapture = vi.fn();
    slider.hasPointerCapture = () => false;

    fireEvent.pointerMove(slider, { clientX: 50 });
    expect(screen.getByText('0:30', { selector: '.playback-bar__tooltip' })).toBeInTheDocument(); // 25% of 120s

    fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
    expect(onSeek).toHaveBeenLastCalledWith(60);

    fireEvent.pointerLeave(slider);
  });

  it('inline variant is a read-only decoration', () => {
    const el = makeAudio();
    const { container } = render(<PlaybackBar getElement={() => el} />);
    expect(container.querySelector('.playback-bar--inline')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
