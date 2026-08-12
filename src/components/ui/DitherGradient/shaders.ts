// Screen-space dither gradient shaders.
//
// The whole effect is computed from `gl_FragCoord` (device pixels), NOT from
// object/UV space. That is the crux of this component: the dither dots are
// pinned to the screen grid, so moving/scaling/animating the gradient never
// warps them — the exact failure mode of the old SVG `feTurbulence` filter,
// whose noise frequency was in `objectBoundingBox` units.

/** Fullscreen triangle — OGL's `Triangle` geometry provides `position`. */
export const vertex = /* glsl */ `
  attribute vec2 position;

  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

export const fragment = /* glsl */ `
  precision highp float;

  uniform vec2  uResolution;   // canvas backing-store size, device px
  uniform float uPixelRatio;   // devicePixelRatio the canvas was sized with
  uniform float uTime;         // seconds, advanced by the rAF loop

  uniform vec3  uColorHigh;    // gradient highlight (bright blue)
  uniform vec3  uColorLow;     // gradient mid (deep blue)
  uniform vec3  uColorBg;      // gradient fades to this (usually black)

  uniform float uShape;        // 0 = radial, 1 = linear
  uniform vec2  uCenter;       // 0..1, origin at TOP-left (CSS-like)
  uniform float uRadius;       // gradient extent
  uniform float uScaleX;       // radial X stretch (>1 wider ellipse)
  uniform float uScaleY;       // radial Y stretch (>1 taller ellipse)
  uniform float uAngle;        // linear direction, degrees (0 = upward)
  uniform float uIntensity;    // multiplies the gradient value

  uniform float uDitherSize;   // dot/cell size, CSS px
  uniform float uDitherLength; // 0..1, length of the partial-density band
  uniform float uDitherStrength; // 0..1, dithered (1) .. solid (0)

  uniform float uGrain;        // grain amount added to the base color
  uniform float uGrainSize;    // grain cell size, CSS px
  uniform float uGrainSpeed;   // grain animation rate

  uniform float uOpacity;      // 0..1
  uniform float uSeed;         // noise offset

  // "Hash without sine" (Dave Hoskins). High-quality white noise with no
  // visible tiling or diagonal structure — unlike cheap fract(sin/mul) hashes.
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // 3D variant — feed time as the 3rd axis so animated grain flickers IN PLACE
  // (independent sample every frame) instead of scrolling like a pattern.
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 fragPx = gl_FragCoord.xy;
    // Flip Y so uCenter matches CSS convention (y = 0 at the top).
    vec2 uv = vec2(fragPx.x, uResolution.y - fragPx.y) / uResolution;

    // --- 1. gradient intensity g in 0..1 ---
    float g;
    if (uShape < 0.5) {
      vec2 d = uv - uCenter;
      d.x *= uResolution.x / uResolution.y; // aspect-correct so radial is round
      d /= vec2(max(uScaleX, 1e-3), max(uScaleY, 1e-3)); // stretch into ellipse
      g = 1.0 - clamp(length(d) / max(uRadius, 1e-3), 0.0, 1.0);
    } else {
      float a = radians(uAngle);
      vec2 dir = vec2(sin(a), -cos(a));      // 0deg points up the screen
      g = clamp(dot(uv - uCenter, dir) / max(uRadius, 1e-3) + 0.5, 0.0, 1.0);
    }
    g = clamp(g * uIntensity, 0.0, 1.0);

    // --- 2. base color ramp: bg -> low -> high ---
    vec3 col = mix(uColorBg, uColorLow, smoothstep(0.0, 0.5, g));
    col = mix(col, uColorHigh, smoothstep(0.5, 1.0, g));

    // --- 3. animated grain on the main color ---
    // Filmic: resample per grain cell each ~24fps time-step, time on its own
    // axis so it flickers in place rather than sliding across the screen.
    float grainCell = max(uGrainSize * uPixelRatio, 1.0);
    float gStep = floor(uTime * 24.0 * uGrainSpeed);
    float grainN = hash13(vec3(floor(fragPx / grainCell) + uSeed, gStep));
    col += (grainN - 0.5) * uGrain;

    // --- 4. stochastic dither: lit-probability follows density ---
    // ditherLength stretches the band where dots are partially populated.
    float lo = 1.0 - clamp(uDitherLength, 0.0, 1.0);
    float density = clamp((g - lo) / max(uDitherLength, 1e-3), 0.0, 1.0);

    float ditherCell = max(uDitherSize * uPixelRatio, 1.0);
    vec2 cell = floor(fragPx / ditherCell);
    float threshold = hash12(cell + uSeed * 17.0);
    // Gate on density > 0: step() lights cells whose hash is exactly 0.0, which
    // would sprinkle stray dots across the black where there's no gradient.
    float lit = step(threshold, density) * step(1e-4, density);

    // Blend toward solid as strength drops (0 = plain gradient, no dither).
    lit = mix(lit, 1.0, (1.0 - clamp(uDitherStrength, 0.0, 1.0)) * step(0.001, g));
    lit = max(lit, step(0.9999, g)); // keep the very core solid

    float alpha = clamp(lit, 0.0, 1.0) * clamp(uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;
