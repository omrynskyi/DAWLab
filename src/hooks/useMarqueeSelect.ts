import { useCallback, useEffect, useRef, useState } from 'react';

export interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Options {
  /** The scrolling element the marquee is drawn in (must be positioned). */
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Called with the keys (data-select-key, in DOM order) of every item the box touches. */
  onChange: (keys: string[], additive: boolean) => void;
}

// Presses on these never start a marquee — they have their own behaviour.
const IGNORE_TARGETS = '.library-item, .list-row, button, input, textarea, select, a, [role="button"], [role="dialog"]';
const DRAG_THRESHOLD_PX = 4;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_MAX_SPEED = 18;

/**
 * Finder-style drag-to-select. Press on empty space and drag to draw a box;
 * every element in the container carrying `data-select-key` that the box touches
 * is reported. Holding Shift/Cmd keeps the existing selection. The box lives in
 * scroll-content coordinates, so it stays anchored while the container scrolls
 * (and auto-scrolls when the pointer nears the top or bottom edge).
 */
export function useMarqueeSelect({ containerRef, enabled, onChange }: Options) {
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const onChangeRef = useRef(onChange);
  const suppressClickRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => () => cleanupRef.current?.(), []);

  // A finished drag is followed by a click on the background, which would clear
  // the selection we just made. The caller asks this first and skips if true.
  const consumeClick = useCallback(() => {
    const was = suppressClickRef.current;
    suppressClickRef.current = false;
    return was;
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!enabled || e.button !== 0 || !container) return;
    if ((e.target as HTMLElement).closest(IGNORE_TARGETS)) return;

    const bounds = container.getBoundingClientRect();
    if (e.clientX - bounds.left >= container.clientWidth) return; // scrollbar

    // Keep text from being selected while dragging, and drop focus from any field.
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();

    const additive = e.shiftKey || e.metaKey;
    const origin = { x: e.clientX, y: e.clientY };
    const startX = e.clientX - bounds.left + container.scrollLeft;
    const startY = e.clientY - bounds.top + container.scrollTop;
    let pointer = { x: e.clientX, y: e.clientY };
    let active = false;
    let raf = 0;
    let lastSignature = '';

    const update = () => {
      const b = container.getBoundingClientRect();
      const curX = pointer.x - b.left + container.scrollLeft;
      const curY = pointer.y - b.top + container.scrollTop;
      const box: MarqueeBox = {
        left: Math.min(startX, curX),
        top: Math.min(startY, curY),
        width: Math.abs(curX - startX),
        height: Math.abs(curY - startY),
      };
      setMarquee(box);

      // Hit-test in viewport coordinates.
      const l = box.left + b.left - container.scrollLeft;
      const t = box.top + b.top - container.scrollTop;
      const keys: string[] = [];
      container.querySelectorAll<HTMLElement>('[data-select-key]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.left < l + box.width && r.right > l && r.top < t + box.height && r.bottom > t) {
          keys.push(el.dataset.selectKey!);
        }
      });
      const signature = keys.join('|');
      if (signature !== lastSignature) {
        lastSignature = signature;
        onChangeRef.current(keys, additive);
      }
    };

    const autoscroll = () => {
      const b = container.getBoundingClientRect();
      let dy = 0;
      if (pointer.y < b.top + AUTOSCROLL_EDGE_PX) {
        dy = -Math.min(1, (b.top + AUTOSCROLL_EDGE_PX - pointer.y) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_SPEED;
      } else if (pointer.y > b.bottom - AUTOSCROLL_EDGE_PX) {
        dy = Math.min(1, (pointer.y - (b.bottom - AUTOSCROLL_EDGE_PX)) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_SPEED;
      }
      if (dy) {
        const before = container.scrollTop;
        container.scrollTop += dy;
        if (container.scrollTop !== before) update();
      }
      raf = requestAnimationFrame(autoscroll);
    };

    const onMove = (ev: MouseEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < DRAG_THRESHOLD_PX) return;
        active = true;
        raf = requestAnimationFrame(autoscroll);
      }
      update();
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (raf) cancelAnimationFrame(raf);
      cleanupRef.current = null;
    };

    function onUp() {
      cleanup();
      setMarquee(null);
      if (active) {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 0);
      }
    }

    cleanupRef.current?.();
    cleanupRef.current = () => { cleanup(); setMarquee(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [containerRef, enabled]);

  return { marquee, onMouseDown, consumeClick };
}
