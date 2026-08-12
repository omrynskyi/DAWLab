import type { DitherGradientParams } from "./DitherGradient";
import type { DitherTween } from "./animate";

// Single source of truth for the dither looks used across the app. Tune these
// (e.g. in the Dither Lab → Copy) and every consumer updates at once.

/** Onboarding wizard: a soft blue top band behind the steps. */
export const ONBOARDING_DITHER: DitherGradientParams = {
  shape: "radial",
  centerX: 0.47,
  centerY: -0.17,
  radius: 1.61,
  scaleX: 2.34,
  scaleY: 1.08,
  angle: 0,
  intensity: 1.25,
  ditherSize: 0.5,
  ditherLength: 0.1,
  ditherStrength: 1,
  grain: 0.02,
  grainSize: 0.5,
  grainSpeed: 0.2,
  opacity: 1,
  speed: 1,
  seed: 4,
  colorHigh: "#007BFF",
  colorLow: "#001240",
  colorBg: "#000000",
};

/** Outro target — the blue sweeps down and fills behind the wordmark. Only the
 *  fields that differ from the wizard base are interpolated (the rest stay put). */
export const ONBOARDING_DITHER_OUTRO: DitherTween = {
  centerY: 0.3,
  radius: 1.85,
  scaleX: 3,
  scaleY: 1.35,
  ditherLength: 0.06,
};

/** Empty library: a faint wash anchored above the top, behind the header. */
export const EMPTY_LIBRARY_DITHER: DitherGradientParams = {
  shape: "radial",
  centerX: 0.5,
  centerY: -0.2,
  radius: 2.06,
  scaleX: 3,
  scaleY: 1.5,
  angle: 0,
  intensity: 1.08,
  ditherSize: 0.5,
  ditherLength: 0.03,
  ditherStrength: 1,
  grain: 0.03,
  grainSize: 0.5,
  grainSpeed: 0.2,
  opacity: 1,
  speed: 1,
  seed: 4,
  colorHigh: "#007BFF",
  colorLow: "#001040",
  colorBg: "#000000",
};

/** Named presets the Dither Lab can load. Merge tween-only presets over a base. */
export const DITHER_PRESETS: Record<string, DitherGradientParams> = {
  Onboarding: ONBOARDING_DITHER,
  "Onboarding outro": { ...ONBOARDING_DITHER, ...ONBOARDING_DITHER_OUTRO },
  "Empty library": EMPTY_LIBRARY_DITHER,
};
