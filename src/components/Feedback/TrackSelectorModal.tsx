import type { TrackEntry } from "./MultiTrackView";

interface TrackSelectorModalProps {
  availableTracks: TrackEntry[];
  onAdd: (track: TrackEntry) => void;
  onClose: () => void;
}

export default function TrackSelectorModal({ availableTracks, onAdd, onClose }: TrackSelectorModalProps) {
  return (
    <div className="track-selector-overlay" onClick={onClose}>
      <div className="track-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="track-selector-header">
          <span>Select Comparison Track</span>
          <button className="track-selector-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {availableTracks.length === 0 ? (
          <div className="track-selector-empty">All comparison tracks already added.</div>
        ) : (
          <div className="track-selector-list">
            {availableTracks.map(track => (
              <button
                key={track.id}
                className="track-selector-row"
                onClick={() => onAdd(track)}
              >
                <span className="track-selector-label">{track.label || "(no message)"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
