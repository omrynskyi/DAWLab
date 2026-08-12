import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import { useReducedMotion } from "motion/react";
import { vertex, fragment } from "./shaders";
import "./DitherGradient.css";

export type DitherShape = "radial" | "linear";

/**
 * Every field is animatable — drive them with React state, `motion` values, or
 * the imperative `setParams` handle (the last avoids a React re-render per
 * frame, best for 60fps authoring).
 */
export interface DitherGradientParams {
  /** Gradient highlight colour (bright core). */
  colorHigh?: string;
  /** Gradient mid colour (deep blue). */
  colorLow?: string;
  /** Colour the gradient fades out to (usually black). */
  colorBg?: string;
  /** `radial` (empty-library look) or `linear`. */
  shape?: DitherShape;
  /** Gradient origin X, 0..1, CSS-like (0 = left). */
  centerX?: number;
  /** Gradient origin Y, 0..1, CSS-like (0 = top). */
  centerY?: number;
  /** Gradient extent. Larger = the blue reaches further. */
  radius?: number;
  /** Radial X stretch — >1 makes a wider ellipse (radial shape only). */
  scaleX?: number;
  /** Radial Y stretch — >1 makes a taller ellipse (radial shape only). */
  scaleY?: number;
  /** Linear direction in degrees (0 = up the screen). */
  angle?: number;
  /** Multiplies the gradient value. */
  intensity?: number;
  /** Dot/cell size in CSS px — the dither "size" knob. */
  ditherSize?: number;
  /** Length of the partial-density dither band, 0..1. */
  ditherLength?: number;
  /** Dithered (1) .. solid (0). */
  ditherStrength?: number;
  /** Grain amount added to the base colour. */
  grain?: number;
  /** Grain cell size in CSS px. */
  grainSize?: number;
  /** Grain animation rate. */
  grainSpeed?: number;
  /** Overall opacity, 0..1. */
  opacity?: number;
  /** Time multiplier for the animated grain. */
  speed?: number;
  /** Freeze time (no grain animation). */
  paused?: boolean;
  /** Noise seed — shift the dither/grain pattern. */
  seed?: number;
}

export interface DitherGradientProps extends DitherGradientParams {
  className?: string;
  style?: React.CSSProperties;
}

export interface DitherGradientHandle {
  /** Merge params and push straight to the GPU with no React re-render. */
  setParams: (partial: Partial<DitherGradientParams>) => void;
  /** Current resolved params (defaults + latest overrides). */
  getParams: () => Required<DitherGradientParams>;
}

export const DITHER_GRADIENT_DEFAULTS: Required<DitherGradientParams> = {
  colorHigh: "#007BFF",
  colorLow: "#001240",
  colorBg: "#000000",
  shape: "radial",
  centerX: 0.5,
  centerY: -0.12,
  radius: 1.3,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  intensity: 1,
  ditherSize: 1.5,
  ditherLength: 0.5,
  ditherStrength: 1,
  grain: 0.05,
  grainSize: 1,
  grainSpeed: 1,
  opacity: 1,
  speed: 1,
  paused: false,
  seed: 4,
};

/** Normalise `#rgb`/`#rrggbb` to a 0..1 RGB triple. */
const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = parseInt(h, 16);
  if (Number.isNaN(int)) return [0, 0, 0];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
};

/** Resolve props into a fully-populated params object. */
const resolveParams = (
  props: DitherGradientParams,
): Required<DitherGradientParams> => {
  const out = { ...DITHER_GRADIENT_DEFAULTS };
  (Object.keys(DITHER_GRADIENT_DEFAULTS) as (keyof DitherGradientParams)[]).forEach(
    (key) => {
      const v = props[key];
      if (v !== undefined) (out as Record<string, unknown>)[key] = v;
    },
  );
  return out;
};

/** Write every param into the program's uniforms (no allocation of uniforms). */
const applyUniforms = (
  program: Program,
  p: Required<DitherGradientParams>,
): void => {
  const u = program.uniforms;
  u.uColorHigh.value = hexToRgb(p.colorHigh);
  u.uColorLow.value = hexToRgb(p.colorLow);
  u.uColorBg.value = hexToRgb(p.colorBg);
  u.uShape.value = p.shape === "linear" ? 1 : 0;
  u.uCenter.value = [p.centerX, p.centerY];
  u.uRadius.value = p.radius;
  u.uScaleX.value = p.scaleX;
  u.uScaleY.value = p.scaleY;
  u.uAngle.value = p.angle;
  u.uIntensity.value = p.intensity;
  u.uDitherSize.value = p.ditherSize;
  u.uDitherLength.value = p.ditherLength;
  u.uDitherStrength.value = p.ditherStrength;
  u.uGrain.value = p.grain;
  u.uGrainSize.value = p.grainSize;
  u.uGrainSpeed.value = p.grainSpeed;
  u.uOpacity.value = p.opacity;
  u.uSeed.value = p.seed;
};

export const DitherGradient = forwardRef<
  DitherGradientHandle,
  DitherGradientProps
>(({ className, style, ...paramProps }, ref) => {
  const params = resolveParams(paramProps);

  const containerRef = useRef<HTMLDivElement>(null);
  const paramsRef = useRef<Required<DitherGradientParams>>(params);
  const programRef = useRef<Program | null>(null);
  const reduceRef = useRef(false);
  const needsRenderRef = useRef(true);

  const reduce = useReducedMotion();
  reduceRef.current = !!reduce;
  paramsRef.current = params;

  useImperativeHandle(
    ref,
    () => ({
      setParams: (partial) => {
        paramsRef.current = { ...paramsRef.current, ...partial };
        if (programRef.current) applyUniforms(programRef.current, paramsRef.current);
        needsRenderRef.current = true;
      },
      getParams: () => ({ ...paramsRef.current }),
    }),
    [],
  );

  // Init the WebGL context ONCE. Params flow in through uniform writes below,
  // never a teardown/rebuild, so live slider drags stay smooth.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new Renderer({ alpha: true, dpr, depth: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      depthTest: false,
      uniforms: {
        uResolution: { value: [1, 1] },
        uPixelRatio: { value: dpr },
        uTime: { value: 0 },
        uColorHigh: { value: [0, 0, 0] },
        uColorLow: { value: [0, 0, 0] },
        uColorBg: { value: [0, 0, 0] },
        uShape: { value: 0 },
        uCenter: { value: [0.5, 0.5] },
        uRadius: { value: 1 },
        uScaleX: { value: 1 },
        uScaleY: { value: 1 },
        uAngle: { value: 0 },
        uIntensity: { value: 1 },
        uDitherSize: { value: 1.5 },
        uDitherLength: { value: 0.5 },
        uDitherStrength: { value: 1 },
        uGrain: { value: 0.05 },
        uGrainSize: { value: 1 },
        uGrainSpeed: { value: 1 },
        uOpacity: { value: 1 },
        uSeed: { value: 4 },
      },
    });
    programRef.current = program;
    applyUniforms(program, paramsRef.current);

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
      needsRenderRef.current = true;
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let raf = 0;
    let last = performance.now();
    let time = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = t - last;
      last = t;
      const p = paramsRef.current;
      const animating = !p.paused && !reduceRef.current;
      if (animating) {
        time += dt * 0.001 * p.speed;
        program.uniforms.uTime.value = time;
        renderer.render({ scene: mesh });
      } else if (needsRenderRef.current) {
        renderer.render({ scene: mesh });
        needsRenderRef.current = false;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      programRef.current = null;
    };
    // Deliberately init-once; params are synced via the effect below.
  }, []);

  // Push param changes into uniforms without rebuilding the context.
  useEffect(() => {
    if (programRef.current) {
      applyUniforms(programRef.current, params);
      needsRenderRef.current = true;
    }
    // Individual primitives so the effect runs on any param change (listing
    // `params` itself would be a new object every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.colorHigh,
    params.colorLow,
    params.colorBg,
    params.shape,
    params.centerX,
    params.centerY,
    params.radius,
    params.scaleX,
    params.scaleY,
    params.angle,
    params.intensity,
    params.ditherSize,
    params.ditherLength,
    params.ditherStrength,
    params.grain,
    params.grainSize,
    params.grainSpeed,
    params.opacity,
    params.seed,
  ]);

  return (
    <div
      ref={containerRef}
      className={`dither-gradient${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden="true"
    />
  );
});

DitherGradient.displayName = "DitherGradient";
