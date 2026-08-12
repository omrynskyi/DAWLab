import React, { useState } from "react";
import {
  DitherGradient,
  DITHER_GRADIENT_DEFAULTS,
  DITHER_PRESETS,
  type DitherGradientParams,
} from "../../components/ui/DitherGradient";
import "./DitherLab.css";

interface SliderDef {
  key: keyof DitherGradientParams;
  label: string;
  min: number;
  max: number;
  step: number;
}

// Numeric knobs, grouped for the panel. Dither/grain first — the stars.
const SLIDERS: { group: string; items: SliderDef[] }[] = [
  {
    group: "Dither",
    items: [
      { key: "ditherSize", label: "Size (px)", min: 0.5, max: 12, step: 0.1 },
      { key: "ditherLength", label: "Length", min: 0, max: 1, step: 0.01 },
      { key: "ditherStrength", label: "Strength", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    group: "Grain",
    items: [
      { key: "grain", label: "Amount", min: 0, max: 0.4, step: 0.005 },
      { key: "grainSize", label: "Size (px)", min: 0.5, max: 8, step: 0.1 },
      { key: "grainSpeed", label: "Speed", min: 0, max: 4, step: 0.05 },
    ],
  },
  {
    group: "Gradient",
    items: [
      { key: "centerX", label: "Center X", min: -0.5, max: 1.5, step: 0.01 },
      { key: "centerY", label: "Center Y", min: -0.5, max: 1.5, step: 0.01 },
      { key: "radius", label: "Radius", min: 0.1, max: 3, step: 0.01 },
      { key: "scaleX", label: "Scale X (ellipse)", min: 0.2, max: 3, step: 0.01 },
      { key: "scaleY", label: "Scale Y (ellipse)", min: 0.2, max: 3, step: 0.01 },
      { key: "angle", label: "Angle (linear)", min: 0, max: 360, step: 1 },
      { key: "intensity", label: "Intensity", min: 0, max: 2, step: 0.01 },
    ],
  },
  {
    group: "Global",
    items: [
      { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01 },
      { key: "speed", label: "Speed", min: 0, max: 4, step: 0.05 },
      { key: "seed", label: "Seed", min: 0, max: 64, step: 1 },
    ],
  },
];

const COLORS: { key: keyof DitherGradientParams; label: string }[] = [
  { key: "colorHigh", label: "High" },
  { key: "colorLow", label: "Low" },
  { key: "colorBg", label: "Background" },
];

const DitherLab: React.FC = () => {
  const [params, setParams] = useState<Required<DitherGradientParams>>({
    ...DITHER_GRADIENT_DEFAULTS,
  });
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof DitherGradientParams>(
    key: K,
    value: Required<DitherGradientParams>[K],
  ) => setParams((prev) => ({ ...prev, [key]: value }));

  const loadPreset = (preset: DitherGradientParams) =>
    setParams({ ...DITHER_GRADIENT_DEFAULTS, ...preset });

  // Copy the current look as a ready-to-paste params object (drops `paused`,
  // which is a runtime flag, not part of a look).
  const copyParams = () => {
    const { paused: _paused, ...look } = params;
    void _paused;
    navigator.clipboard
      ?.writeText(JSON.stringify(look, null, 2))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <div className="dither-lab">
      <DitherGradient className="dither-lab__preview" {...params} />

      <aside className="dither-lab__panel">
        <header className="dither-lab__header">
          <h1 className="dither-lab__title">Dither Gradient</h1>
          <div className="dither-lab__header-actions">
            <button
              className="dither-lab__btn"
              onClick={() => set("paused", !params.paused)}
            >
              {params.paused ? "Play" : "Pause"}
            </button>
            <button
              className="dither-lab__btn"
              onClick={() => setParams({ ...DITHER_GRADIENT_DEFAULTS })}
            >
              Reset
            </button>
          </div>
        </header>

        <div className="dither-lab__row">
          <span className="dither-lab__group-label">Presets</span>
          <div className="dither-lab__presets">
            {Object.entries(DITHER_PRESETS).map(([name, preset]) => (
              <button
                key={name}
                className="dither-lab__preset-btn"
                onClick={() => loadPreset(preset)}
              >
                {name}
              </button>
            ))}
            <button
              className="dither-lab__preset-btn dither-lab__preset-btn--copy"
              onClick={copyParams}
            >
              {copied ? "Copied ✓" : "Copy params"}
            </button>
          </div>
        </div>

        <div className="dither-lab__row dither-lab__row--shape">
          <span className="dither-lab__group-label">Shape</span>
          <div className="dither-lab__toggle">
            {(["radial", "linear"] as const).map((s) => (
              <button
                key={s}
                className={`dither-lab__toggle-btn${
                  params.shape === s ? " is-active" : ""
                }`}
                onClick={() => set("shape", s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="dither-lab__colors">
          {COLORS.map(({ key, label }) => (
            <label key={key} className="dither-lab__color">
              <input
                type="color"
                value={params[key] as string}
                onChange={(e) => set(key, e.target.value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {SLIDERS.map(({ group, items }) => (
          <section key={group} className="dither-lab__section">
            <span className="dither-lab__group-label">{group}</span>
            {items.map(({ key, label, min, max, step }) => {
              const value = params[key] as number;
              return (
                <label key={key} className="dither-lab__slider">
                  <span className="dither-lab__slider-label">
                    {label}
                    <em>{value.toFixed(step < 1 ? 2 : 0)}</em>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => set(key, parseFloat(e.target.value))}
                  />
                </label>
              );
            })}
          </section>
        ))}
      </aside>
    </div>
  );
};

export default DitherLab;
