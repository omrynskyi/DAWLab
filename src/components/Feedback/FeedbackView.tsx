import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import AudioPlayer, { type AudioPlayerHandle, type WaveformContextInfo } from "./WavGraph";
import MultiTrackView, { type MultiTrackHandle, type TrackEntry } from "./MultiTrackView";
import TrackSelectorModal from "./TrackSelectorModal";
import WaveformMinimap from "./WaveformMinimap";
import CommentSection, { type CommentSectionHandle } from "./CommentSection";
import SidebarCommentList from "./SidebarCommentList";
import TopBar from "./TopBar";
import FilterPopover from "./FilterPopover";
import TimelineRuler from "./TimelineRuler";
import type { Comment, TagRef } from "./CommentCard";
import { AddCommentIcon } from "./Icons";
import { PRESET_TAGS, TAG_COLORS } from "./CommentCard";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import {
  DRAFT_ID,
  activeCommentId,
  loadUserColor,
  newCommentId,
  useCommitComments,
  withNewComment,
  withReply,
  withTag,
  withoutComment,
  withoutReply,
  withoutTag,
} from "./commentStore";
import "./Feedback.css";

/**
 * Full-screen feedback view for a version's audio preview — a port of the
 * website's share-link feedback page (Website/src/pages/Feedback.tsx). Same
 * UI; comments are stored locally per version instead of through share links.
 */

type ViewMode = "timeline" | "sidebar";

/** A version with an audio preview, as offered to the feedback view. */
export interface FeedbackVersion {
  commitId: string;
  previewFile: string;
  label: string;
}

interface FeedbackViewProps {
  projectName: string;
  /** The version the view opens on. */
  version: FeedbackVersion;
  /** Every version with a preview; the others are offered as A/B tracks. */
  versions: FeedbackVersion[];
  username: string;
  /** The History player's live position; read when this view's audio is ready. */
  getStartTime?: () => number;
  /** Keep playing — History carries on until this view's audio is running. */
  autoPlay?: boolean;
  /** This view's audio is running; the History player can stop now. */
  onTakeover?: () => void;
  /**
   * Leaving full screen. When still playing, this view keeps playing until the
   * parent unmounts it, so the History player can take over without a gap.
   */
  onClose: (handoff: FeedbackHandoff) => void;
}

export interface FeedbackHandoff {
  playing: boolean;
  /** Playhead position right now (keeps moving while playing). */
  liveTime: () => number;
}

// Drift beyond this after a player handoff gets corrected with a seek.
const HANDOFF_DRIFT_S = 0.08;

interface PreviewSources {
  playUrl: string;
  fetchUrl: string;
}

type ContextMenuState =
  | { x: number; y: number; type: "waveform-selection"; range: { start: number; end: number } }
  | { x: number; y: number; type: "waveform-comment"; comment: Comment }
  | { x: number; y: number; type: "waveform-empty"; time: number }
  | { x: number; y: number; type: "timeline-empty"; time: number }
  | { x: number; y: number; type: "tag"; tag: TagRef; comment: Comment };

export default function FeedbackView({
  projectName,
  version,
  versions,
  username,
  getStartTime,
  autoPlay = false,
  onTakeover,
  onClose,
}: FeedbackViewProps) {
  const playerRef = useRef<MultiTrackHandle>(null);
  const mobilePlayerRef = useRef<AudioPlayerHandle>(null);
  const commentRef = useRef<CommentSectionHandle>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width for zoom/minimap logic
  useEffect(() => {
    const el = waveformContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [isMobile]);
  const [activeCommentIds, setActiveCommentIds] = useState<Set<string>>(new Set());
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null);
  const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  // Track ids are commit ids, so the active track decides whose comments show.
  const [activeTrackId, setActiveTrackId] = useState<string>(version.commitId);
  const commitId = activeTrackId;
  const { comments, setComments } = useCommitComments(projectName, commitId);
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [loadError, setLoadError] = useState<{ status?: number; message: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const resolveSources = useCallback(
    (v: FeedbackVersion): Promise<PreviewSources | null> =>
      window.ipcRenderer.invoke("get-preview-sources", projectName, v.commitId, v.previewFile),
    [projectName],
  );

  // Load the version the view was opened on.
  const { commitId: primaryId, previewFile: primaryFile, label: primaryLabel } = version;
  useEffect(() => {
    let cancelled = false;
    resolveSources({ commitId: primaryId, previewFile: primaryFile, label: primaryLabel })
      .then((sources) => {
        if (cancelled) return;
        if (!sources) {
          setLoadError({ message: "This version's audio preview couldn't be found on disk." });
          return;
        }
        setTracks([{
          id: primaryId,
          audioUrl: sources.playUrl,
          peaksUrl: sources.fetchUrl,
          label: primaryLabel,
          comments: [],
        }]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError({ message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [primaryId, primaryFile, primaryLabel, resolveSources]);

  // Other versions with previews, not yet on screen, for the A/B picker.
  const comparisonCandidates = useMemo<TrackEntry[]>(
    () => versions
      .filter(v => !tracks.some(t => t.id === v.commitId))
      .map(v => ({ id: v.commitId, audioUrl: "", label: v.label, comments: [] })),
    [versions, tracks],
  );

  // Comparison tracks are resolved (and their audio decoded) only once picked.
  const handleAddComparison = useCallback((entry: TrackEntry) => {
    const v = versions.find(x => x.commitId === entry.id);
    setShowTrackModal(false);
    if (!v) return;
    resolveSources(v)
      .then((sources) => {
        if (!sources) {
          console.error("[Feedback] Preview missing for version", v.commitId);
          return;
        }
        setTracks(prev => prev.some(t => t.id === v.commitId) ? prev : [...prev, {
          id: v.commitId,
          audioUrl: sources.playUrl,
          peaksUrl: sources.fetchUrl,
          label: v.label,
          comments: [],
        }]);
      })
      .catch((err: unknown) => console.error("[Feedback] Failed to resolve preview:", err));
  }, [versions, resolveSources]);

  const [userColor] = useState<string>(loadUserColor);
  const [viewMode, setViewMode] = useState<ViewMode>("sidebar");
  const [sidebarDraftTrigger, setSidebarDraftTrigger] = useState(0);

  // Zoom/scroll state
  const [pxPerSec, setPxPerSec] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [peaks, setPeaks] = useState<Float32Array>(new Float32Array(0));
  // The active track's own duration — may differ from `duration` (the global max)
  const [activeDuration, setActiveDuration] = useState(0);

  const handlePeaksReady = useCallback((p: Float32Array) => {
    setPeaks(p);
  }, []);

  const handleUpdateViewFromMinimap = useCallback((newSL: number, newPPS: number) => {
    const container = waveformContainerRef.current;
    if (!container) return;
    
    const maxScroll = Math.max(0, newPPS * durationRef.current - container.clientWidth);
    const clampedSL = Math.max(0, Math.min(newSL, maxScroll));
    
    setPxPerSec(newPPS);
    pxPerSecRef.current = newPPS;
    setScrollLeft(clampedSL);
    scrollLeftRef.current = clampedSL;
    commentRef.current?.setScrollLeft(clampedSL);
  }, []);

  // Handle duration change from engine
  const handleDurationChange = useCallback((d: number) => {
    setDuration(d);
    durationRef.current = d;

    // Auto-fit on first load
    if (pxPerSecRef.current === 0 && d > 0 && waveformContainerRef.current) {
      const basePPS = waveformContainerRef.current.clientWidth / d;
      setPxPerSec(basePPS);
      pxPerSecRef.current = basePPS;
    }
  }, []);

  // Hover and snap state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ commentId: string; side: "start" | "end"; time: number } | null>(null);

  // ── Undo/Redo History ──
  type HistoryEntry = { comments: Comment[]; actionName: string };
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [lastAction, setLastAction] = useState<{ type: "undo" | "redo"; name: string; time: number } | null>(null);
  const preDragCommentsRef = useRef<Comment[] | null>(null);

  const pushToHistory = useCallback((newComments: Comment[], actionName: string) => {
    setPast(prev => [...prev, { comments: commentsRef.current, actionName }]);
    setFuture([]);
    setComments(newComments);
  }, [setComments]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setPast(newPast);
    setFuture(prev => [{ comments, actionName: entry.actionName }, ...prev]);
    setComments(entry.comments);
    setLastAction({ type: "undo", name: entry.actionName, time: Date.now() });
  }, [past, comments, setComments]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const entry = future[0];
    const newFuture = future.slice(1);

    setFuture(newFuture);
    setPast(prev => [...prev, { comments, actionName: entry.actionName }]);
    setComments(entry.comments);
    setLastAction({ type: "redo", name: entry.actionName, time: Date.now() });
  }, [future, comments, setComments]);

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleUndoRedo = (e: KeyboardEvent) => {
      const isZ = e.key.toLowerCase() === "z";
      const isCmd = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (isCmd && isZ) {
        e.preventDefault();
        if (isShift) redo();
        else undo();
      } else if (isCmd && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleUndoRedo);
    return () => window.removeEventListener("keydown", handleUndoRedo);
  }, [undo, redo]);

  // Refs for zoom calculations (avoid stale closures)
  const pxPerSecRef = useRef(0);
  pxPerSecRef.current = pxPerSec;
  const scrollLeftRef = useRef(0);
  scrollLeftRef.current = scrollLeft;
  const durationRef = useRef(0);
  durationRef.current = duration;
  const currentTimeRef = useRef(0);
  currentTimeRef.current = currentTime;
  const commentsRef = useRef<Comment[]>([]);
  commentsRef.current = comments;

  // Mouse-anchored zoom state
  const zoomAnchorRef = useRef<{ time: number; mouseX: number } | null>(null);
  const anchorResetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zoomAccumRef = useRef(0);
  const zoomRafRef = useRef(0);

  // Switching versions swaps the comment list, so its undo history goes too.
  useEffect(() => {
    setPast([]);
    setFuture([]);
    setFocusedCommentId(null);
  }, [commitId]);

  // Compute base pxPerSec when duration is known and container is measured
  useEffect(() => {
    if (duration <= 0) return;
    const container = waveformContainerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth;
    const basePPS = containerWidth / duration;
    setPxPerSec(basePPS);
    pxPerSecRef.current = basePPS;
  }, [duration]);

  // ResizeObserver: update basePPS on window resize when at base zoom
  useEffect(() => {
    const container = waveformContainerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      if (durationRef.current <= 0) return;
      const containerWidth = container.clientWidth;
      const basePPS = containerWidth / durationRef.current;
      if (pxPerSecRef.current <= basePPS + 0.1) {
        setPxPerSec(basePPS);
        pxPerSecRef.current = basePPS;
        setScrollLeft(0);
        scrollLeftRef.current = 0;
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [isMobile]);

  const isMobileRef = useRef(false);
  isMobileRef.current = isMobile;
  const activePlayerRef = useCallback(() =>
    isMobileRef.current ? mobilePlayerRef.current : playerRef.current, []);
  const handlePlay = useCallback(() => activePlayerRef()?.play(), [activePlayerRef]);
  const handlePause = useCallback(() => activePlayerRef()?.pause(), [activePlayerRef]);
  const handleStop = useCallback(() => {
    activePlayerRef()?.pause();
    activePlayerRef()?.seekTo(0);
  }, [activePlayerRef]);

  // Spacebar support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (isPlaying) handlePause();
        else handlePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, handlePlay, handlePause]);

  // Take over from the History player once the audio is ready: start at its
  // live position, and let it stop only when ours is actually running (see
  // handleTimeUpdate) — so there's no silent gap while this view loads.
  const getStartTimeRef = useRef(getStartTime);
  getStartTimeRef.current = getStartTime;
  const onTakeoverRef = useRef(onTakeover);
  onTakeoverRef.current = onTakeover;
  // Seek target of a takeover in progress; null once handed over.
  const takeoverFromRef = useRef<number | null>(null);
  const startAppliedRef = useRef(false);
  useEffect(() => {
    if (startAppliedRef.current || duration <= 0) return;
    startAppliedRef.current = true;
    const start = Math.min(getStartTimeRef.current?.() ?? 0, duration);
    if (start > 0) activePlayerRef()?.seekTo(start);
    if (autoPlay) {
      takeoverFromRef.current = start;
      activePlayerRef()?.play();
    } else {
      onTakeoverRef.current?.();
    }
  }, [duration, autoPlay, activePlayerRef]);

  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const handleClose = useCallback(() => {
    const playing = isPlayingRef.current;
    if (!playing) activePlayerRef()?.pause();
    onClose({
      playing,
      liveTime: () => activePlayerRef()?.getCurrentTime() ?? currentTimeRef.current,
    });
  }, [activePlayerRef, onClose]);

  // Esc leaves full screen — unless it's dismissing something inside the view.
  const escBlockedRef = useRef(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (escBlockedRef.current) return;
      e.preventDefault();
      handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // Helper: clamp scroll
  const clampScroll = useCallback((sl: number, pps: number) => {
    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0) return 0;
    const maxScroll = Math.max(0, pps * durationRef.current - container.clientWidth);
    return Math.max(0, Math.min(sl, maxScroll));
  }, []);

  // Ref to cancel any ongoing smooth-zoom animation
  const smoothZoomRafRef = useRef(0);

  // Spring-interpolated animated zoom to target pps and scroll
  const smoothZoomTo = useCallback((targetPPS: number, targetScroll: number) => {
    cancelAnimationFrame(smoothZoomRafRef.current);

    const STIFFNESS = 0.10; // spring pull strength per frame
    const THRESHOLD = 0.05; // stop when close enough

    const tick = () => {
      const pps = pxPerSecRef.current;
      const sl = scrollLeftRef.current;

      const dpps = (targetPPS - pps) * STIFFNESS;
      const dsl = (targetScroll - sl) * STIFFNESS;

      const newPPS = pps + dpps;
      const newScroll = clampScroll(sl + dsl, newPPS);

      pxPerSecRef.current = newPPS;
      scrollLeftRef.current = newScroll;
      setPxPerSec(newPPS);
      setScrollLeft(newScroll);
      commentRef.current?.setScrollLeft(newScroll);

      const done = Math.abs(targetPPS - newPPS) < THRESHOLD && Math.abs(targetScroll - newScroll) < THRESHOLD;
      if (!done) {
        smoothZoomRafRef.current = requestAnimationFrame(tick);
      } else {
        // Snap to exact target to avoid float drift
        pxPerSecRef.current = targetPPS;
        scrollLeftRef.current = targetScroll;
        setPxPerSec(targetPPS);
        setScrollLeft(targetScroll);
        commentRef.current?.setScrollLeft(targetScroll);
      }
    };

    smoothZoomRafRef.current = requestAnimationFrame(tick);
  }, [clampScroll]);

  // Flush accumulated zoom deltas (rAF-throttled)
  const flushZoom = useCallback(() => {
    zoomRafRef.current = 0;
    const delta = zoomAccumRef.current;
    zoomAccumRef.current = 0;
    if (Math.abs(delta) < 0.1) return;

    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0) return;

    const basePPS = container.clientWidth / durationRef.current;
    const anchor = zoomAnchorRef.current;

    const factor = Math.exp(-delta / 600);
    const newPPS = Math.max(basePPS, Math.min(pxPerSecRef.current * factor, 1000));

    let newScroll: number;
    if (anchor) {
      newScroll = anchor.time * newPPS - anchor.mouseX;
    } else {
      const vw = container.clientWidth;
      const centerTime = (scrollLeftRef.current + vw / 2) / pxPerSecRef.current;
      newScroll = centerTime * newPPS - vw / 2;
    }

    newScroll = clampScroll(newScroll, newPPS);

    pxPerSecRef.current = newPPS;
    scrollLeftRef.current = newScroll;
    setPxPerSec(newPPS);
    setScrollLeft(newScroll);

    commentRef.current?.setScrollLeft(newScroll);
  }, [clampScroll]);

  // Mouse-anchored wheel zoom (Ctrl/Cmd + wheel)
  useEffect(() => {
    if (isMobile) return;
    const container = waveformContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const isZoom = e.ctrlKey || e.metaKey;

      // Horizontal pan: two-finger swipe (deltaX) or shift+scroll
      if (!isZoom && (Math.abs(e.deltaX) > 0 || e.shiftKey)) {
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        const newScroll = clampScroll(scrollLeftRef.current + delta, pxPerSecRef.current);
        scrollLeftRef.current = newScroll;
        setScrollLeft(newScroll);
        commentRef.current?.setScrollLeft(newScroll);
        return;
      }

      if (!isZoom) return;
      e.preventDefault();

      if (!zoomAnchorRef.current) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        zoomAnchorRef.current = {
          time: (mouseX + scrollLeftRef.current) / pxPerSecRef.current,
          mouseX,
        };
      }

      clearTimeout(anchorResetTimerRef.current);
      anchorResetTimerRef.current = setTimeout(() => {
        zoomAnchorRef.current = null;
      }, 300);

      zoomAccumRef.current += e.deltaY;
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(flushZoom);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [flushZoom, clampScroll, isMobile]);

  // Also attach wheel zoom to comment section
  useEffect(() => {
    if (isMobile) return;
    const commentEl = document.querySelector(".comment-section-wrapper");
    if (!commentEl) return;

    const handleWheel = (e: WheelEvent) => {
      const isZoom = e.ctrlKey || e.metaKey;

      // Horizontal pan
      if (!isZoom && (Math.abs(e.deltaX) > 0 || e.shiftKey)) {
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        const newScroll = clampScroll(scrollLeftRef.current + delta, pxPerSecRef.current);
        scrollLeftRef.current = newScroll;
        setScrollLeft(newScroll);
        commentRef.current?.setScrollLeft(newScroll);
        return;
      }

      if (!isZoom) return;
      e.preventDefault();

      const container = waveformContainerRef.current;
      if (!container) return;

      if (!zoomAnchorRef.current) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        zoomAnchorRef.current = {
          time: (mouseX + scrollLeftRef.current) / pxPerSecRef.current,
          mouseX,
        };
      }

      clearTimeout(anchorResetTimerRef.current);
      anchorResetTimerRef.current = setTimeout(() => {
        zoomAnchorRef.current = null;
      }, 300);

      zoomAccumRef.current += e.deltaY;
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(flushZoom);
      }
    };

    commentEl.addEventListener("wheel", handleWheel as EventListener, { passive: false });
    return () => commentEl.removeEventListener("wheel", handleWheel as EventListener);
  }, [flushZoom, clampScroll, isMobile]);

  // Button zoom — anchors to playhead so the playhead stays centered
  const handleZoomIn = useCallback(() => {
    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0) return;
    const vw = container.clientWidth;
    const anchorTime = currentTimeRef.current;
    const newPPS = Math.min(pxPerSecRef.current * 1.3, 1000);
    const newScroll = clampScroll(anchorTime * newPPS - vw / 2, newPPS);

    pxPerSecRef.current = newPPS;
    scrollLeftRef.current = newScroll;
    setPxPerSec(newPPS);
    setScrollLeft(newScroll);
    commentRef.current?.setScrollLeft(newScroll);
  }, [clampScroll]);

  const handleZoomOut = useCallback(() => {
    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0) return;
    const basePPS = container.clientWidth / durationRef.current;
    const vw = container.clientWidth;
    const anchorTime = currentTimeRef.current;
    const newPPS = Math.max(pxPerSecRef.current / 1.3, basePPS);
    const newScroll = clampScroll(anchorTime * newPPS - vw / 2, newPPS);

    pxPerSecRef.current = newPPS;
    scrollLeftRef.current = newScroll;
    setPxPerSec(newPPS);
    setScrollLeft(newScroll);
    commentRef.current?.setScrollLeft(newScroll);
  }, [clampScroll]);

  const handleZoomReset = useCallback(() => {
    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0) return;
    const basePPS = container.clientWidth / durationRef.current;

    pxPerSecRef.current = basePPS;
    scrollLeftRef.current = 0;
    setPxPerSec(basePPS);
    setScrollLeft(0);
    commentRef.current?.setScrollLeft(0);
  }, []);

  // Scroll sync: comments → waveform
  const handleCommentScroll = useCallback((left: number) => {
    setScrollLeft(left);
    scrollLeftRef.current = left;
  }, []);

  const handleWaveformMouseMove = useCallback((e: React.MouseEvent) => {
    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0 || pxPerSecRef.current <= 0) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const time = (mouseX + scrollLeftRef.current) / pxPerSecRef.current;

    // Snapping logic
    const SNAP_PX = 10;
    const snapThreshold = SNAP_PX / pxPerSecRef.current;
    let bestEdge = null;
    let minDiff = snapThreshold;

    for (const c of commentsRef.current) {
      const startDiff = Math.abs(time - c.timestamp);
      if (startDiff < minDiff) {
        minDiff = startDiff;
        bestEdge = { commentId: c.id, side: "start" as const, time: c.timestamp };
      }
      const end = c.endTimestamp ?? c.timestamp + 5;
      const endDiff = Math.abs(time - end);
      if (endDiff < minDiff) {
        minDiff = endDiff;
        bestEdge = { commentId: c.id, side: "end" as const, time: end };
      }
    }

    setHoveredEdge(bestEdge);
    setHoverTime(bestEdge ? bestEdge.time : time);
  }, []);

  const handleWaveformMouseLeave = useCallback(() => {
    setHoverTime(null);
    setHoveredEdge(null);
  }, []);

  const handleFocusComment = useCallback((id: string | null) => {
    setFocusedCommentId(id);
  }, []);

  const selectedRangeRef = useRef<{ start: number; end: number } | null>(null);
  selectedRangeRef.current = selectedRange;
  const loopRangeRef = useRef(loopRange);
  loopRangeRef.current = loopRange;
  const handleCreateDraftRef = useRef<((atTime?: number, explicitRange?: { start: number; end: number }) => void) | null>(null);

  const handleRangeSelect = useCallback((start: number, end: number) => {
    setSelectedRange({ start, end });
    setFocusedCommentId(null);
    handleCreateDraftRef.current?.(undefined, { start, end });
  }, []);

  const handleSeek = useCallback((time: number) => {
    // If a drag selection is active, first click only dismisses it — no seek
    if (selectedRangeRef.current) {
      setSelectedRange(null);
      setFocusedCommentId(null);
      return;
    }
    playerRef.current?.seekTo(time);
    setFocusedCommentId(null);
  }, []);

  const handleCommentCmdClick = useCallback((comment: Comment) => {
    playerRef.current?.seekTo(comment.timestamp);
    playerRef.current?.play();
    setFocusedCommentId(comment.id);
  }, []);

  const handleCommentDoubleClick = useCallback((comment: Comment) => {
    playerRef.current?.seekTo(comment.timestamp);
    playerRef.current?.play();
    setFocusedCommentId(comment.id);

    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0) return;

    const vw = container.clientWidth;
    const targetLeft = comment.timestamp * pxPerSecRef.current - vw / 2;
    const newScroll = clampScroll(targetLeft, pxPerSecRef.current);

    scrollLeftRef.current = newScroll;
    setScrollLeft(newScroll);
    commentRef.current?.setScrollLeft(newScroll);
  }, [clampScroll]);

  const handleGroupClick = useCallback((groupComments: Comment[]) => {
    if (!duration || groupComments.length === 0) return;
    const container = waveformContainerRef.current;
    if (!container) return;

    const times = groupComments.map(c => c.timestamp);
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const centerT = (minT + maxT) / 2;
    const rangeT = maxT - minT;
    const vw = container.clientWidth;

    let targetPPS = 20;
    if (rangeT > 0) {
      const ppsToFit = (vw * 0.3) / rangeT;
      targetPPS = Math.max(15, Math.min(ppsToFit, 45));
    }

    const newScroll = clampScroll(centerT * targetPPS - vw / 2, targetPPS);

    pxPerSecRef.current = targetPPS;
    scrollLeftRef.current = newScroll;
    setPxPerSec(targetPPS);
    setScrollLeft(newScroll);
    commentRef.current?.setScrollLeft(newScroll);
  }, [duration, clampScroll]);

  // Sidebar: single click highlights, double click plays
  const handleSidebarCommentClick = useCallback((comment: Comment) => {
    setFocusedCommentId(comment.id);
    setSelectedRange(null);
  }, []);

  const handleSidebarCommentDoubleClick = useCallback((comment: Comment) => {
    playerRef.current?.seekTo(comment.timestamp);
    playerRef.current?.play();
    setFocusedCommentId(comment.id);
  }, []);

  // ── Tag management ──
  const [customTags, setCustomTags] = useState<TagRef[]>([]);

  const handleAddTag = useCallback((commentId: string, tag: TagRef) => {
    const nextComments = withTag(commentsRef.current, commentId, tag);

    setCustomTags(prev => {
      if (prev.some(t => t.name === tag.name)) return prev;
      return [...prev, tag];
    });

    pushToHistory(nextComments, "add tag");
  }, [pushToHistory]);

  const handleRemoveTag = useCallback((commentId: string, tagName: string) => {
    pushToHistory(withoutTag(commentsRef.current, commentId, tagName), "remove tag");
  }, [pushToHistory]);

  const handleAddReply = useCallback((commentId: string, text: string) => {
    if (commentId === DRAFT_ID) return;
    pushToHistory(withReply(commentsRef.current, commentId, username, text), "add reply");
  }, [pushToHistory, username]);

  const handleDeleteComment = useCallback((commentId: string) => {
    pushToHistory(withoutComment(commentsRef.current, commentId), "delete comment");
    if (focusedCommentId === commentId) {
      setFocusedCommentId(null);
    }
  }, [pushToHistory, focusedCommentId, setFocusedCommentId]);

  const handleDeleteReply = useCallback((commentId: string, replyId: string) => {
    pushToHistory(withoutReply(commentsRef.current, commentId, replyId), "delete reply");
  }, [pushToHistory]);

  // ── Filter system ──
  const [includeTags, setIncludeTags] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>(["Archived"]);

  // Collect all unique tags from comments + presets + custom
  const allKnownTags = useMemo(() => {
    const map = new Map<string, TagRef>();
    // presets first
    for (const t of PRESET_TAGS) map.set(t.name, t);
    // custom tags
    for (const t of customTags) map.set(t.name, t);
    // tags from comments
    for (const c of comments) {
      for (const t of (c.tags || [])) {
        if (!map.has(t.name)) map.set(t.name, t);
      }
    }
    return Array.from(map.values());
  }, [comments, customTags]);

  const handleToggleInclude = useCallback((tagName: string) => {
    setIncludeTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
    // Remove from exclude if it was there
    setExcludeTags(prev => prev.filter(t => t !== tagName));
  }, []);

  const handleToggleExclude = useCallback((tagName: string) => {
    setExcludeTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
    // Remove from include if it was there
    setIncludeTags(prev => prev.filter(t => t !== tagName));
  }, []);

  const handleClearFilters = useCallback(() => {
    setIncludeTags([]);
    setExcludeTags(["Archived"]);
  }, []);

  // Compute the single "highlighted" comment: focused click > playhead position (always)
  const activeHighlightId = useMemo(
    () => activeCommentId(comments, focusedCommentId, currentTime),
    [focusedCommentId, currentTime, comments],
  );

  // Apply filters
  const filteredComments = useMemo(() => {
    if (includeTags.length === 0 && excludeTags.length === 0) return comments;
    return comments.filter(c => {
      // Draft comments always pass
      if (c.id === DRAFT_ID) return true;
      const tagNames = (c.tags || []).map(t => t.name);
      // Must have ALL include tags (AND)
      if (includeTags.length > 0 && !includeTags.every(t => tagNames.includes(t))) return false;
      // Must have NONE of exclude tags
      if (excludeTags.length > 0 && excludeTags.some(t => tagNames.includes(t))) return false;
      return true;
    });
  }, [comments, includeTags, excludeTags]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
    // First sign our audio is moving: catch up with the History player (it kept
    // going while we started), then tell it to stop.
    const takeoverFrom = takeoverFromRef.current;
    if (takeoverFrom !== null && time > takeoverFrom + 0.01) {
      takeoverFromRef.current = null;
      const live = getStartTimeRef.current?.();
      if (live !== undefined && Math.abs(live - time) > HANDOFF_DRIFT_S) activePlayerRef()?.seekTo(live);
      onTakeoverRef.current?.();
    }
    if (loopRangeRef.current && time >= loopRangeRef.current.end) {
      playerRef.current?.seekTo(loopRangeRef.current.start);
    }
  }, [activePlayerRef]);

  const handleSetLoop = useCallback((range: { start: number; end: number }) => {
    setLoopRange(range);
    playerRef.current?.seekTo(range.start);
    playerRef.current?.play();
  }, []);

  const handleClearLoop = useCallback(() => {
    setLoopRange(null);
  }, []);

  const handleToggleLoop = useCallback(() => {
    if (loopRange) {
      setLoopRange(null);
    } else {
      const range = selectedRangeRef.current;
      if (range) {
        setLoopRange(range);
        playerRef.current?.seekTo(range.start);
      } else {
        const start = currentTimeRef.current;
        setLoopRange({ start, end: start + 5 });
      }
    }
  }, [loopRange]);

  const handleArchiveCommentsInRange = useCallback((range: { start: number; end: number }) => {
    const archivedTag = PRESET_TAGS[1];
    const nextComments = commentsRef.current.map(c => {
      if (c.id === DRAFT_ID) return c;
      if (c.timestamp < range.start || c.timestamp > range.end) return c;
      const existing = c.tags || [];
      if (existing.some(t => t.name === archivedTag.name)) return c;
      return { ...c, tags: [...existing, archivedTag] };
    });
    pushToHistory(nextComments, "archive comments in selection");
  }, [pushToHistory]);

  const handleDeleteTagFromAll = useCallback((tagName: string) => {
    const nextComments = commentsRef.current.map(c => ({
      ...c,
      tags: (c.tags || []).filter(t => t.name !== tagName),
    }));
    pushToHistory(nextComments, "delete tag from all");
  }, [pushToHistory]);

  const handleChangeTagColor = useCallback((tagName: string, colorIndex: number) => {
    const nextComments = commentsRef.current.map(c => ({
      ...c,
      tags: (c.tags || []).map(t => t.name === tagName ? { ...t, colorIndex } : t),
    }));
    pushToHistory(nextComments, "change tag color");
  }, [pushToHistory]);

  const handleWaveformContextMenu = useCallback((info: WaveformContextInfo) => {
    if (info.type === "selection") {
      setContextMenu({ x: info.x, y: info.y, type: "waveform-selection", range: info.range });
    } else if (info.type === "comment") {
      setContextMenu({ x: info.x, y: info.y, type: "waveform-comment", comment: info.comment });
    } else {
      setContextMenu({ x: info.x, y: info.y, type: "waveform-empty", time: info.time });
    }
  }, []);

  const handleTimelineContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y, type: "timeline-empty", time: currentTimeRef.current });
  }, []);

  const handleTagContextMenu = useCallback((tag: TagRef, comment: Comment, x: number, y: number) => {
    setContextMenu({ x, y, type: "tag", tag, comment });
  }, []);

  const handleCreateDraft = useCallback((atTime?: number, explicitRange?: { start: number; end: number }) => {
    if (viewMode === "sidebar") {
      if (explicitRange) setSelectedRange(explicitRange);
      setSidebarDraftTrigger(Date.now());
      return;
    }

    const range = explicitRange ?? selectedRangeRef.current;
    const draftTime = atTime !== undefined ? atTime : (range ? range.start : currentTimeRef.current);
    const draftEnd  = atTime !== undefined ? atTime + 5 : (range ? range.end : draftTime + 5);
    setSelectedRange(null);

    // Remove any existing draft
    setComments((prev) => {
      const withoutDraft = prev.filter(c => c.id !== DRAFT_ID);
      return [
        ...withoutDraft,
        {
          id: DRAFT_ID,
          username,
          authorColor: userColor,
          comment: "",
          timestamp: draftTime,
          endTimestamp: draftEnd,
        },
      ];
    });

    // Zoom in so the draft card doesn't collide with neighbors
    const container = waveformContainerRef.current;
    if (!container || durationRef.current <= 0) return;

    const CARD_W = 320;
    const GAP = 12;
    const vw = container.clientWidth;

    // Find the nearest existing comments on each side
    const existingComments = commentsRef.current.filter(c => c.id !== DRAFT_ID);
    let nearestDist = Infinity;
    for (const c of existingComments) {
      const dist = Math.abs(c.timestamp - draftTime);
      if (dist > 0 && dist < nearestDist) nearestDist = dist;
    }

    // Calculate minimum pxPerSec so that (nearestDist * pps) > CARD_W + GAP
    // This ensures no overlap between the draft and its nearest neighbor
    const minPPS = nearestDist < Infinity
      ? (CARD_W + GAP) / nearestDist
      : pxPerSecRef.current;

    // Only zoom in, never zoom out. Cap at max zoom level.
    const basePPS = vw / durationRef.current;
    const newPPS = Math.min(Math.max(minPPS, pxPerSecRef.current), 1000);
    const finalPPS = Math.max(newPPS, basePPS);

    // Center viewport on the draft, smoothly animated
    const newScroll = clampScroll(draftTime * finalPPS - vw / 2, finalPPS);
    smoothZoomTo(finalPPS, newScroll);
  }, [clampScroll, smoothZoomTo, viewMode, username, userColor, setComments]);
  handleCreateDraftRef.current = handleCreateDraft;

  const handleDraftSubmit = useCallback((comment: string) => {
    const draft = commentsRef.current.find(c => c.id === DRAFT_ID);
    if (!draft) return;
    const id = newCommentId();
    const nextComments = commentsRef.current.map((c) =>
      c.id === DRAFT_ID ? { ...c, id, comment } : c
    );
    pushToHistory(nextComments, "submit comment");
  }, [pushToHistory]);

  // Draft submit (sidebar mode) — the sidebar composer owns its own draft.
  const handleSidebarDraftSubmit = useCallback((comment: string, timestamp: number, endTimestamp: number) => {
    const nextComments = withNewComment(commentsRef.current, {
      username, authorColor: userColor, comment, timestamp, endTimestamp,
    });
    pushToHistory(nextComments, "submit comment");
    setSelectedRange(null);
  }, [pushToHistory, username, userColor]);

  const handleCommentRangeChange = useCallback((commentId: string, start: number, end: number) => {
    if (!preDragCommentsRef.current) {
      preDragCommentsRef.current = commentsRef.current;
    }
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, timestamp: start, endTimestamp: end } : c
    ));
  }, [setComments]);

  const handleCommentRangeChangeCommit = useCallback((commentId: string, start: number, end: number) => {
    const startComments = preDragCommentsRef.current || commentsRef.current;
    preDragCommentsRef.current = null;

    setPast(prev => [...prev, { comments: startComments, actionName: "resize comment" }]);
    setFuture([]);
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, timestamp: start, endTimestamp: end } : c
    ));
  }, [setComments]);

  const handleCommentFocus = useCallback((commentId: string) => {
    setFocusedCommentId(commentId);
  }, []);

  const handleDraftCancel = useCallback(() => {
    setComments((prev) => prev.filter(c => c.id !== DRAFT_ID));
    setSelectedRange(null);
  }, [setComments]);

  // Keyboard shortcut for adding comment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (e.key === " ") return;

      // Check if draft already exists
      const hasDraft = comments.some(c => c.id === DRAFT_ID);
      if (hasDraft) return;

      handleCreateDraft();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [comments, handleCreateDraft]);


  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // ── Waveform vertical resizer (timeline mode) ──
  const [timelineWaveformHeight, setTimelineWaveformHeight] = useState(440);
  const [isWaveformResizing, setIsWaveformResizing] = useState(false);

  const startWaveformResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsWaveformResizing(true);
  }, []);

  useEffect(() => {
    if (!isWaveformResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const waveformTop = waveformContainerRef.current?.getBoundingClientRect().top ?? 0;
      const newHeight = e.clientY - waveformTop;
      const minHeight = 120;
      const maxHeight = 720;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setTimelineWaveformHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsWaveformResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "ns-resize";

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
    };
  }, [isWaveformResizing]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = 280;
      const maxWidth = window.innerWidth * 0.5;
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "ew-resize";

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  const activeLabel = tracks.find(t => t.id === activeTrackId)?.label ?? primaryLabel;
  escBlockedRef.current = contextMenu !== null || showTrackModal || comments.some(c => c.id === DRAFT_ID);

  if (loadError) {
    return (
      <div className="feedback-page feedback-overlay">
        <div className="feedback-titlebar" />
        <div className="feedback-error">
          <div className="feedback-error__body">
            <h1 className="feedback-error__title">Couldn't load this version</h1>
            <p className="feedback-error__message">{loadError.message}</p>
            <p className="feedback-error__hint">Try attaching the preview to this version again from the History page.</p>
          </div>
          <button className="toolbar-btn toolbar-btn--with-text" onClick={() => onClose({ playing: false, liveTime: () => 0 })}>
            <span>Back to History</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="h-screen text-white flex flex-col overflow-hidden feedback-page feedback-overlay"
      role="dialog"
      aria-label={`Feedback for ${projectName}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      {/* Window drag strip; keeps the macOS traffic lights clear of the top bar */}
      <div className="feedback-titlebar" />
      <TopBar
        currentTime={currentTime}
        isPlaying={isPlaying}
        onStop={handleStop}
        onTogglePlay={isPlaying ? handlePause : handlePlay}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        lastAction={lastAction}
        songTitle={projectName}
        sharedBy={activeLabel}
        allKnownTags={allKnownTags}
        includeTags={includeTags}
        excludeTags={excludeTags}
        onToggleInclude={handleToggleInclude}
        onToggleExclude={handleToggleExclude}
        onClearFilters={handleClearFilters}
        onZoomReset={handleZoomReset}
        onZoomOut={handleZoomOut}
        onZoomIn={handleZoomIn}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        loopRange={loopRange}
        onToggleLoop={handleToggleLoop}
        showAddTrack={tracks.length > 0 && comparisonCandidates.length > 0}
        onAddTrack={() => setShowTrackModal(true)}
        onClose={handleClose}
      />

      {/* Mobile layout */}
      {isMobile && (
        <div className="mobile-layout">
          <div className="mobile-waveform-strip" ref={waveformContainerRef}>
            <AudioPlayer
              ref={mobilePlayerRef}
              audioUrl={tracks[0]?.audioUrl || ""}
              peaksUrl={tracks[0]?.peaksUrl}
              initialPeaks={tracks[0]?.initialPeaks}
              initialDuration={tracks[0]?.initialDuration}
              onTimeUpdate={handleTimeUpdate}
              onPlayStateChange={setIsPlaying}
              onDurationChange={handleDurationChange}
              onPeaksReady={handlePeaksReady}
              pxPerSec={pxPerSec}
              scrollLeft={0}
              currentTime={currentTime}
              comments={filteredComments}
              activeCommentIds={activeCommentIds}
              highlightedCommentId={focusedCommentId}
              selectedRange={selectedRange}
              hoveredEdge={null}
              loopRange={loopRange}
              onLoopRangeChange={setLoopRange}
              onSeek={handleSeek}
              onRangeSelect={handleRangeSelect}
              onClearRange={() => setSelectedRange(null)}
              onCommentCmdClick={() => {}}
              onCommentRangeChange={() => {}}
              onCommentRangeChangeCommit={() => {}}
              onCommentFocus={handleCommentFocus}
              onWaveformContextMenu={() => {}}
            />
            {duration > 0 && pxPerSec > 0 && (
              <div
                className="playhead-line"
                style={{ left: Math.round(currentTime * pxPerSec) }}
              />
            )}
          </div>
          <div className="mobile-filter-bar">
            <FilterPopover
              allTags={allKnownTags}
              includeTags={includeTags}
              excludeTags={excludeTags}
              onToggleInclude={handleToggleInclude}
              onToggleExclude={handleToggleExclude}
              onClear={handleClearFilters}
            />
          </div>

          <div className="mobile-comment-list">
            <SidebarCommentList
              comments={filteredComments}
              focusedCommentId={activeHighlightId}
              currentTime={currentTime}
              draftTriggerKey={sidebarDraftTrigger}
              onCommentClick={handleSidebarCommentClick}
              onCommentDoubleClick={handleSidebarCommentDoubleClick}
              onDeselect={() => setFocusedCommentId(null)}
              selectedRange={selectedRange}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              onAddReply={handleAddReply}
              onDeleteComment={handleDeleteComment}
              onDeleteReply={handleDeleteReply}
              allCustomTags={customTags}
              onTagContextMenu={handleTagContextMenu}
              onDraftSubmit={handleSidebarDraftSubmit}
              onDraftCancel={handleDraftCancel}
            />
          </div>
        </div>
      )}

      {/* Desktop/tablet content */}
      {!isMobile && <div className={`feedback-layout feedback-layout--${viewMode}`}
        style={{ ["--sidebar-width" as string]: `${sidebarWidth}px` }}
      >
        <div className="feedback-main" ref={contentRef}>
          
          <WaveformMinimap
            peaks={peaks}
            duration={duration}
            activeDuration={activeDuration > 0 ? activeDuration : duration}
            pxPerSec={pxPerSec}
            scrollLeft={scrollLeft}
            containerWidth={containerWidth}
            onUpdateView={handleUpdateViewFromMinimap}
            visible={duration > 0 && containerWidth > 0 ? pxPerSec > (containerWidth / duration) * 1.05 : false}
          />

          {/* Waveform + Timeline wrapper */}
          <motion.div
            ref={waveformContainerRef}
            className="waveform-wrapper"
            onMouseMove={handleWaveformMouseMove}
            onMouseLeave={handleWaveformMouseLeave}
            animate={viewMode === "timeline" ? {
              height: duration > 0 && containerWidth > 0 && pxPerSec > (containerWidth / duration) * 1.05
                ? timelineWaveformHeight - 60
                : timelineWaveformHeight
            } : {}}
            transition={isWaveformResizing ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
          >
            {tracks.length > 0 ? (
              <MultiTrackView
                ref={playerRef}
                tracks={tracks.map(t => t.id === activeTrackId ? { ...t, comments: filteredComments } : t)}
                activeTrackId={activeTrackId}
                isResizing={isWaveformResizing}
                onTimeUpdate={handleTimeUpdate}
                onPlayStateChange={setIsPlaying}
                onDurationChange={handleDurationChange}
                onPeaksReady={handlePeaksReady}
                onActiveTrackDuration={setActiveDuration}
                pxPerSec={pxPerSec}
                scrollLeft={scrollLeft}
                currentTime={currentTime}
                activeCommentIds={activeCommentIds}
                highlightedCommentId={focusedCommentId}
                selectedRange={selectedRange}
                hoveredEdge={hoveredEdge}
                loopRange={loopRange}
                onLoopRangeChange={setLoopRange}
                onSeek={handleSeek}
                onRangeSelect={handleRangeSelect}
                onClearRange={() => setSelectedRange(null)}
                onCommentCmdClick={handleCommentCmdClick}
                onCommentRangeChange={handleCommentRangeChange}
                onCommentRangeChangeCommit={handleCommentRangeChangeCommit}
                onCommentFocus={handleCommentFocus}
                onWaveformContextMenu={handleWaveformContextMenu}
                onActiveTrackChange={setActiveTrackId}
                onDeleteTrack={(trackId) => {
                  setTracks(prev => {
                    const next = prev.filter(t => t.id !== trackId);
                    if (activeTrackId === trackId && next.length > 0) {
                      setActiveTrackId(next[0].id);
                    }
                    return next;
                  });
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">Loading audio...</div>
            )}
            <TimelineRuler
              duration={duration}
              scrollLeft={scrollLeft}
              pxPerSec={pxPerSec}
              onSeek={handleSeek}
              onTimelineContextMenu={handleTimelineContextMenu}
            />
            {/* Extended hover indicator spanning waveform + ruler */}
            {hoverTime !== null && pxPerSec > 0 && (
              <div
                className="timeline-hover-indicator"
                style={{ left: Math.round(hoverTime * pxPerSec - scrollLeft) }}
              />
            )}
            {/* Full-height playhead line spanning waveform + timeline ruler */}
            {duration > 0 && pxPerSec > 0 && (
              <div
                className="playhead-line"
                style={{ left: Math.round(currentTime * pxPerSec - scrollLeft) }}
              />
            )}
          </motion.div>

          {/* Waveform vertical resizer (timeline mode only) */}
          {viewMode === "timeline" && (
            <div
              className={`waveform-resizer-handle ${isWaveformResizing ? "waveform-resizer-handle--active" : ""}`}
              onMouseDown={startWaveformResizing}
            />
          )}

          {/* Add Comment — timeline mode only, centered below waveform */}
          {viewMode === "timeline" && (
            <div className="timeline-add-comment">
              <button className="toolbar-btn toolbar-btn--with-text" onClick={() => handleCreateDraft()}>
                <AddCommentIcon />
                <span>Add Comment</span>
              </button>
            </div>
          )}



          {/* Timeline mode: comment section below toolbar */}
          <AnimatePresence>
            {viewMode === "timeline" && (
              <motion.div
                className="comment-section-wrapper"
                initial={{ opacity: 0, scaleY: 0.95, y: 20 }}
                animate={{ opacity: 1, scaleY: 1, y: 0 }}
                exit={{ opacity: 0, scaleY: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{ transformOrigin: "top" }}
              >
                <CommentSection
                ref={commentRef}
                duration={duration}
                pxPerSec={pxPerSec}
                onScroll={handleCommentScroll}
                comments={filteredComments}
                focusedCommentId={activeHighlightId}
                onFocusComment={handleFocusComment}
                onCommentDoubleClick={handleCommentDoubleClick}
                onGroupClick={handleGroupClick}
                onActiveCommentsChange={setActiveCommentIds}
                onDraftSubmit={handleDraftSubmit}
                onDraftCancel={handleDraftCancel}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                onAddReply={handleAddReply}
                onDeleteComment={handleDeleteComment}
                onDeleteReply={handleDeleteReply}
                allCustomTags={customTags}
                onTagContextMenu={handleTagContextMenu}
              />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Context menu overlay */}
        <AnimatePresence>
          {contextMenu && (() => {
            const state = contextMenu;

            function buildItems(): ContextMenuItem[] {
              if (state.type === "waveform-selection") {
                const items: ContextMenuItem[] = [
                  {
                    label: "Comment on selection",
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
                    onClick: () => handleCreateDraft(undefined, state.range),
                  },
                ];
                if (loopRange) {
                  items.push({
                    label: "Clear loop",
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
                    onClick: handleClearLoop,
                  });
                } else {
                  items.push({
                    label: "Loop selection",
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
                    onClick: () => handleSetLoop(state.range),
                  });
                }
                items.push({
                  label: "Archive all in selection",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="5"/><path d="M4 9v9a2 2 0 002 2h12a2 2 0 002-2V9"/><path d="M10 13h4"/></svg>,
                  onClick: () => handleArchiveCommentsInRange(state.range),
                });
                return items;
              }
              if (state.type === "waveform-comment") {
                const isResolved = state.comment.tags?.some(t => t.name === "Done");
                const items: ContextMenuItem[] = [];
                if (!isResolved) {
                  items.push({
                    label: "Resolve",
                    variant: "success",
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
                    onClick: () => handleAddTag(state.comment.id, PRESET_TAGS[0]),
                  });
                }
                items.push({
                  label: "Archive",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="5"/><path d="M4 9v9a2 2 0 002 2h12a2 2 0 002-2V9"/><path d="M10 13h4"/></svg>,
                  onClick: () => handleAddTag(state.comment.id, PRESET_TAGS[1]),
                });
                return items;
              }
              if (state.type === "waveform-empty") {
                const items: ContextMenuItem[] = [{
                  label: "Create comment",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
                  onClick: () => handleCreateDraft(state.time),
                }];
                if (loopRange) {
                  items.push({
                    label: "Clear loop",
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
                    onClick: handleClearLoop,
                  });
                }
                return items;
              }
              if (state.type === "timeline-empty") {
                return [{
                  label: "Create comment at playhead",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
                  onClick: () => handleCreateDraft(),
                }];
              }
              if (state.type === "tag") {
                return [{
                  label: "Remove from comment",
                  variant: "danger" as const,
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
                  onClick: () => handleRemoveTag(state.comment.id, state.tag.name),
                }];
              }
              return [];
            }

            function buildFooter(): React.ReactNode {
              if (state.type === "waveform-comment") {
                const comment = state.comment;
                const tagNames = new Set((comment.tags || []).map(t => t.name));
                const allTags = [...PRESET_TAGS, ...customTags.filter(t => !PRESET_TAGS.some(p => p.name === t.name))];
                return (
                  <>
                    <div className="context-menu__label">TAGS</div>
                    <div className="context-menu__tag-row">
                      {allTags.map(tag => (
                        <span
                          key={tag.name}
                          className="tag-pill tag-pill--selectable"
                          style={{
                            background: TAG_COLORS[tag.colorIndex]?.bg,
                            color: TAG_COLORS[tag.colorIndex]?.text,
                            opacity: tagNames.has(tag.name) ? 1 : 0.5,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tagNames.has(tag.name)) {
                              // Active tag → open tag context (color/delete/remove)
                              setContextMenu({ x: e.clientX, y: e.clientY, type: "tag", tag, comment });
                            } else {
                              handleAddTag(comment.id, tag);
                            }
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </>
                );
              }
              if (state.type === "tag") {
                return (
                  <>
                    <div className="context-menu__label">COLOR</div>
                    <div className="context-menu__color-row">
                      {TAG_COLORS.map((c, i) => (
                        <div
                          key={i}
                          className={`context-menu__swatch${i === state.tag.colorIndex ? " context-menu__swatch--active" : ""}`}
                          style={{ background: c.text }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChangeTagColor(state.tag.name, i);
                            setContextMenu(null);
                          }}
                        />
                      ))}
                    </div>
                    <div
                      className="context-menu__item context-menu__item--danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTagFromAll(state.tag.name);
                        setContextMenu(null);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                      Delete tag from all
                    </div>
                  </>
                );
              }
              return undefined;
            }

            return (
              <ContextMenu
                x={state.x}
                y={state.y}
                items={buildItems()}
                footer={buildFooter()}
                onClose={() => setContextMenu(null)}
              />
            );
          })()}
        </AnimatePresence>

        {/* Sidebar mode: comment list in right panel */}
        <AnimatePresence initial={false}>
          {viewMode === "sidebar" && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: sidebarWidth }}
              exit={{ width: 0 }}
              transition={isResizing ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 35 }}
              style={{ flexShrink: 0, position: "relative" }}
              className="h-full flex flex-col"
            >
              <div 
                className={`sidebar-resizer-handle ${isResizing ? "sidebar-resizer-handle--active" : ""}`}
                onMouseDown={startResizing}
              />
                <div className="feedback-sidebar">
                  <SidebarCommentList
                    comments={filteredComments}
                    focusedCommentId={activeHighlightId}
                    currentTime={currentTime}
                    draftTriggerKey={sidebarDraftTrigger}
                    onCommentClick={handleSidebarCommentClick}
                    onCommentDoubleClick={handleSidebarCommentDoubleClick}
                    onDeselect={() => setFocusedCommentId(null)}
                    selectedRange={selectedRange}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                    onAddReply={handleAddReply}
                    onDeleteComment={handleDeleteComment}
                    onDeleteReply={handleDeleteReply}
                    allCustomTags={customTags}
                    onTagContextMenu={handleTagContextMenu}
                    onDraftSubmit={handleSidebarDraftSubmit}
                    onDraftCancel={handleDraftCancel}
                  />
                </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>}

      {showTrackModal && (
        <TrackSelectorModal
          availableTracks={comparisonCandidates}
          onAdd={handleAddComparison}
          onClose={() => setShowTrackModal(false)}
        />
      )}

    </motion.div>
  );
}
