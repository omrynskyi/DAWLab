import type { DitherGradientHandle, DitherGradientParams } from "./DitherGradient";

/** Params that are safe to interpolate (the numeric ones). */
export type DitherTween = Partial<{
  centerX: number;
  centerY: number;
  radius: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  intensity: number;
  ditherSize: number;
  ditherLength: number;
  ditherStrength: number;
  grain: number;
  grainSize: number;
  grainSpeed: number;
  opacity: number;
  speed: number;
}>;

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export interface TweenOptions {
  /** Seconds. */
  duration?: number;
  /** Seconds before the tween starts. */
  delay?: number;
  ease?: (t: number) => number;
  /** Explicit start values; defaults to the handle's current params. */
  from?: DitherTween;
  onComplete?: () => void;
}

/**
 * rAF-tween a subset of numeric params through the imperative `setParams`
 * handle — no React re-render per frame. Returns a `stop()` cleanup.
 */
export function tweenDither(
  handle: DitherGradientHandle,
  to: DitherTween,
  opts: TweenOptions = {},
): () => void {
  const {
    duration = 1,
    delay = 0,
    ease = easeInOutCubic,
    from,
    onComplete,
  } = opts;

  const startSource = (from ?? handle.getParams()) as Record<string, number>;
  const keys = Object.keys(to) as (keyof DitherTween)[];
  const start: Record<string, number> = {};
  keys.forEach((k) => (start[k] = startSource[k]));

  let raf = 0;
  let startTime = 0;
  let stopped = false;

  const frame = (t: number) => {
    if (stopped) return;
    if (!startTime) startTime = t;
    const elapsed = (t - startTime) / 1000 - delay;
    const p = duration <= 0 ? 1 : Math.min(Math.max(elapsed / duration, 0), 1);

    if (elapsed >= 0) {
      const e = ease(p);
      const partial: Record<string, number> = {};
      keys.forEach((k) => {
        partial[k] = start[k] + ((to[k] as number) - start[k]) * e;
      });
      handle.setParams(partial as Partial<DitherGradientParams>);
    }

    if (p < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      onComplete?.();
    }
  };
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
