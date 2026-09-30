import { LayoutPanelTop, LayoutPanelLeft } from "lucide-react";

type ViewMode = "timeline" | "sidebar";

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewToggle({ mode, onChange }: ViewToggleProps) {
  const isTimeline = mode === "timeline";

  return (
    <>
      <button
        className={`transport-btn transport-btn--large${isTimeline ? " transport-btn--on" : ""}`}
        title="Timeline view"
        onClick={() => onChange("timeline")}
      >
        <LayoutPanelTop size={16} strokeWidth={2} />
      </button>
      <button
        className={`transport-btn transport-btn--large${!isTimeline ? " transport-btn--on" : ""}`}
        title="Sidebar view"
        onClick={() => onChange("sidebar")}
      >
        <LayoutPanelLeft size={16} strokeWidth={2} />
      </button>
    </>
  );
}
