import { motion, AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import logoUrl from "./logo.png";
import { formatTimeWithTenths } from "./utils/timeUtils";
import { Undo2, Redo2, SkipBack, Play, Pause, Minimize2 } from "lucide-react";
import FilterPopover from "./FilterPopover";
import ViewToggle from "./ViewToggle";
import { FitIcon, MinusIcon, PlusIcon, LoopIcon } from "./Icons";
import type { TagRef } from "./CommentCard";

type ViewMode = "timeline" | "sidebar";

interface TopBarProps {
  currentTime: number;
  isPlaying: boolean;
  onStop: () => void;
  onTogglePlay: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  lastAction?: { type: "undo" | "redo"; name: string; time: number } | null;
  songTitle?: string;
  sharedBy?: string;
  allKnownTags: TagRef[];
  includeTags: string[];
  excludeTags: string[];
  onToggleInclude: (tagName: string) => void;
  onToggleExclude: (tagName: string) => void;
  onClearFilters: () => void;
  onZoomReset: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  loopRange?: { start: number; end: number } | null;
  onToggleLoop?: () => void;
  showAddTrack?: boolean;
  onAddTrack?: () => void;
  lockBadge?: ReactNode;
  onClose: () => void;
}

export default function TopBar({
  currentTime,
  isPlaying,
  onStop,
  onTogglePlay,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  lastAction,
  songTitle = "Song 1",
  sharedBy = "shared by user",
  allKnownTags,
  includeTags,
  excludeTags,
  onToggleInclude,
  onToggleExclude,
  onClearFilters,
  onZoomReset,
  onZoomOut,
  onZoomIn,
  viewMode,
  onViewModeChange,
  loopRange,
  onToggleLoop,
  showAddTrack,
  onAddTrack,
  lockBadge,
  onClose,
}: TopBarProps) {
  const timeParts = formatTimeWithTenths(currentTime);

  const isUndoActive = lastAction?.type === "undo";
  const isRedoActive = lastAction?.type === "redo";

  return (
    <div className="top-bar">
      <div className="top-bar__left">
        <motion.div
          className="flex items-center justify-center p-1"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <img src={logoUrl} alt="DAWLab" className="h-9 w-auto object-contain" />
        </motion.div>
        <div className="top-bar__info">
          <span className="top-bar-title">{songTitle}</span>
          <span className="top-bar-subtitle">{sharedBy}</span>
        </div>
      </div>
      
      <div className="top-bar__center">
        <div className="playback-timer">
          <span className="playback-timer__digits">{timeParts.min}</span>
          <span className="playback-timer__separator">:</span>
          <span className="playback-timer__digits">{timeParts.sec}</span>
          <span className="playback-timer__tenths">.{timeParts.tenths}</span>
        </div>

        <div className="top-bar__transport">
          <motion.button
            className="transport-btn"
            onClick={onStop}
            title="Rewind to start"
            whileTap={{ scale: 0.85, x: -2 }}
          >
            <SkipBack size={20} strokeWidth={2.5} fill="currentColor" />
          </motion.button>

          <button
            className="transport-btn transport-btn--main"
            onClick={onTogglePlay}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause size={24} strokeWidth={2.5} fill="currentColor" />
            ) : (
              <Play size={24} strokeWidth={2.5} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>

          <div className="top-bar__separator" />

          <motion.button
            className={`transport-btn transport-btn--large ${!canUndo ? "opacity-30 cursor-not-allowed" : ""}`}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Cmd+Z)"
            key={lastAction?.type === "undo" ? `undo-${lastAction.time}` : "undo-idle"}
            animate={isUndoActive ? { scale: [1, 1.25, 1], rotate: [0, -15, 0] } : { scale: 1, rotate: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            whileTap={canUndo ? { scale: 0.9 } : {}}
          >
            <Undo2 size={22} strokeWidth={2.5} />
          </motion.button>

          <motion.button
            className={`transport-btn transport-btn--large top-bar__redo ${!canRedo ? "opacity-30 cursor-not-allowed" : ""}`}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Cmd+Shift+Z)"
            key={lastAction?.type === "redo" ? `redo-${lastAction.time}` : "redo-idle"}
            animate={isRedoActive ? { scale: [1, 1.25, 1], rotate: [0, 15, 0] } : { scale: 1, rotate: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            whileTap={canRedo ? { scale: 0.9 } : {}}
          >
            <Redo2 size={22} strokeWidth={2.5} />
          </motion.button>

          <div className="top-bar__zoom-group">
            <div className="top-bar__separator" />
            <button className="transport-btn transport-btn--large" onClick={onZoomReset} title="Fit to screen">
              <FitIcon />
            </button>
            <button className="transport-btn transport-btn--large top-bar__zoom-pm" onClick={onZoomOut} title="Zoom out">
              <MinusIcon />
            </button>
            <button className="transport-btn transport-btn--large top-bar__zoom-pm" onClick={onZoomIn} title="Zoom in">
              <PlusIcon />
            </button>
          </div>

          <div className="top-bar__loop-group">
            <div className="top-bar__separator" />
            <button
              className={`transport-btn transport-btn--large${loopRange ? " transport-btn--loop-active" : ""}`}
              onClick={onToggleLoop}
              title={loopRange ? "Clear loop" : "Loop 5s at playhead (or selection)"}
            >
              <LoopIcon />
            </button>
          </div>

          {/* Inline Feedback Message */}
          <div className="top-bar__feedback-wrapper">
            <AnimatePresence mode="wait">
              {lastAction && Date.now() - lastAction.time < 2000 && (
                <motion.div
                  key={`${lastAction.type}-${lastAction.time}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 5 }}
                  className="top-bar__action-feedback"
                >
                  {lastAction.type === "undo" ? "undone" : "redone"} {lastAction.name}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="top-bar__right">
        <div className="top-bar__tools">
          {showAddTrack && (
            <>
              <button
                className="transport-btn transport-btn--large transport-btn--ab"
                onClick={onAddTrack}
                title="Add A/B comparison track"
              >
                <span>A/B</span>
              </button>
              <div className="top-bar__separator" />
            </>
          )}
          <div className="top-bar__view-toggle-group">
            <ViewToggle mode={viewMode} onChange={onViewModeChange} />
            <div className="top-bar__separator" />
          </div>
          <FilterPopover
            allTags={allKnownTags}
            includeTags={includeTags}
            excludeTags={excludeTags}
            onToggleInclude={onToggleInclude}
            onToggleExclude={onToggleExclude}
            onClear={onClearFilters}
          />
        </div>
        {lockBadge && (
          <>
            {lockBadge}
            <div className="top-bar__separator" />
          </>
        )}
        <button className="download-btn top-bar__download-btn" onClick={onClose} title="Exit full screen (Esc)">
          <Minimize2 size={20} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
