import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DitherGradientHandle } from "../DitherGradient";

describe("DitherGradient", () => {
  // Captured across the mocked OGL classes so assertions can read real state.
  let programs: { uniforms: Record<string, { value: unknown }> }[];
  let loseContext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    programs = [];
    loseContext = vi.fn();

    vi.doMock("ogl", () => ({
      Renderer: class {
        dpr = 1;
        gl = {
          canvas: Object.assign(document.createElement("canvas"), {
            width: 100,
            height: 100,
          }),
          clearColor: () => {},
          getExtension: () => ({ loseContext }),
        };
        setSize = () => {};
        render = () => {};
      },
      Program: class {
        uniforms: Record<string, { value: unknown }>;
        constructor(
          _gl: unknown,
          opts: { uniforms: Record<string, { value: unknown }> },
        ) {
          this.uniforms = opts.uniforms;
          programs.push(this);
        }
      },
      Mesh: class {},
      Triangle: class {},
    }));
  });

  it("builds a program with all uniforms and applies the props", async () => {
    const { DitherGradient } = await import("../DitherGradient");
    render(<DitherGradient colorHigh="#ffffff" ditherSize={4} shape="linear" />);

    expect(programs).toHaveLength(1);
    const u = programs[0].uniforms;
    // Core knobs from props.
    expect(u.uColorHigh.value).toEqual([1, 1, 1]);
    expect(u.uDitherSize.value).toBe(4);
    expect(u.uShape.value).toBe(1);
    // Uniforms the shader relies on exist.
    expect(u.uResolution).toBeDefined();
    expect(u.uTime).toBeDefined();
    expect(u.uGrain).toBeDefined();
  });

  it("falls back to defaults for omitted props", async () => {
    const { DitherGradient, DITHER_GRADIENT_DEFAULTS } = await import(
      "../DitherGradient"
    );
    render(<DitherGradient />);
    expect(programs[0].uniforms.uDitherSize.value).toBe(
      DITHER_GRADIENT_DEFAULTS.ditherSize,
    );
    expect(programs[0].uniforms.uShape.value).toBe(0); // radial default
  });

  it("setParams pushes to uniforms without a re-render", async () => {
    const { DitherGradient } = await import("../DitherGradient");
    const ref = React.createRef<DitherGradientHandle>();
    render(<DitherGradient ref={ref} />);

    ref.current!.setParams({ ditherSize: 9 });
    expect(programs[0].uniforms.uDitherSize.value).toBe(9);
    expect(ref.current!.getParams().ditherSize).toBe(9);
  });

  it("releases the GL context on unmount", async () => {
    const { DitherGradient } = await import("../DitherGradient");
    const { unmount } = render(<DitherGradient />);
    unmount();
    expect(loseContext).toHaveBeenCalled();
  });
});
