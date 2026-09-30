import { useEffect, useRef, useCallback } from "react";
import type { Comment } from "./CommentCard";
import { DEFAULT_REGION_DURATION, type RenderData } from "./utils/waveformColors";

// ── Level of Detail (LOD) ─────────────────────────────────────────────────────
//
//  4 tiers keyed by pps / basePPS zoom ratio:
//
//  LOD 0  1×  – 4×    bake at 1×  basePPS   step 2 CSS px
//  LOD 1  4×  – 16×   bake at 4×  basePPS   step 1.5 CSS px
//  LOD 2  16× – 64×   bake at 16× basePPS   step 1.25 CSS px
//  LOD 3  64×+        bake at 64× basePPS   step 1 CSS px
//
//  KEY INVARIANT: each tier always bakes at its LOWER boundary PPS
//  (LOD_MIN_RATIO × basePPS). This guarantees:
//
//    scale = currentPPS / bakePPS  ∈  [1, 4)  within every tier
//
//  Because scale ≥ 1, drawImage always stretches the bake to fill or
//  overflow the viewport — blank edges on zoom-out are impossible.
//  The same bake is valid for the whole tier; it is only rebuilt when
//  a tier boundary is crossed or the user pans.
// ─────────────────────────────────────────────────────────────────────────────
const LOD_MAX_RATIO = [4,  16,  64,  Infinity] as const; // upper bound per tier
const LOD_MIN_RATIO = [1,   4,  16,        64] as const; // lower bound (= bake ratio)
const LOD_STEP_CSS  = [2, 1.5, 1.25,         1] as const; // path sample density

type LodLevel = 0 | 1 | 2 | 3;
type DrawMode  = "quality" | "fast" | "composite";

function getLodLevel(pps: number, basePPS: number): LodLevel {
  if (basePPS <= 0) return 0;
  const r = pps / basePPS;
  if (r < LOD_MAX_RATIO[0]) return 0;
  if (r < LOD_MAX_RATIO[1]) return 1;
  if (r < LOD_MAX_RATIO[2]) return 2;
  return 3;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type WaveformContextInfo =
  | { x: number; y: number; type: "selection"; range: { start: number; end: number } }
  | { x: number; y: number; type: "comment"; comment: Comment }
  | { x: number; y: number; type: "empty"; time: number };

interface WaveformCanvasProps {
  peaks: Float32Array;
  duration: number;
  pxPerSec: number;
  scrollLeft: number;
  currentTime: number;
  comments: Comment[];
  activeCommentIds: Set<string>;
  highlightedCommentId?: string | null;
  selectedRange?: { start: number; end: number } | null;
  hoveredEdge?: { commentId: string; side: "start" | "end"; time: number } | null;
  loopRange?: { start: number; end: number } | null;
  height?: number;
  globalDuration?: number;
  trackLabel?: string;
  isActiveTrack?: boolean;
  onSelectTrack?: () => void;
  onDeleteTrack?: () => void;
  onPeaksReady?: (peaks: Float32Array) => void;
  onSeek?: (time: number) => void;
  onRangeSelect?: (start: number, end: number) => void;
  onClearRange?: () => void;
  onCommentRangeChange?: (commentId: string, start: number, end: number) => void;
  onCommentRangeChangeCommit?: (commentId: string, start: number, end: number) => void;
  onCommentCmdClick?: (comment: Comment) => void;
  onCommentFocus?: (commentId: string) => void;
  onWaveformContextMenu?: (info: WaveformContextInfo) => void;
  onLoopRangeChange?: (range: { start: number; end: number } | null) => void;
}

interface BakedState {
  pps: number;   // bakePPS (≠ screen pps — always the LOD-min pps)
  sl: number;    // bake scroll left (in bake-pps coords)
  lod: LodLevel;
  canvasW: number;
  canvasH: number;
}

// ── Path builder ──────────────────────────────────────────────────────────────
function buildWaveformPath(
  peakData: Float32Array,
  N: number,
  dur: number,
  pps: number,
  sl: number,
  canvasW: number,
  canvasH: number,
  DPR: number,
  deviceStep: number,
): Path2D {
  const path = new Path2D();
  const midY = canvasH / 2;
  const upper: { x: number; y: number }[] = [];

  // Iterate in sample-index space anchored to multiples of sampleStep from 0.
  // This ensures the same absolute samples are drawn on every bake regardless
  // of sl (scroll/resize changes bakeSL), preventing the waveform from visually
  // shifting when the bake window is rebuilt.
  const cssStep   = deviceStep / DPR;
  const sampleStep = Math.max(1, Math.round(cssStep * N / (dur * pps)));

  const tStart   = sl / pps;
  const tEnd     = (sl + canvasW / DPR) / pps;
  // Align first index to the global sampleStep grid so the grid is always stable
  const idxFirst = Math.floor(tStart * N / dur / sampleStep) * sampleStep;
  const idxLast  = Math.min(N - 1, Math.ceil(tEnd * N / dur));

  for (let idx = idxFirst; idx <= idxLast; idx += sampleStep) {
    if (idx < 0 || idx >= N) continue;
    const cx = ((idx / N) * dur * pps - sl) * DPR;
    if (cx < -(deviceStep * 2) || cx > canvasW + deviceStep * 2) continue;
    upper.push({ x: cx, y: midY - Math.max(1 * DPR, (peakData[idx] * canvasH) / 2) });
  }

  if (upper.length === 0) return path;

  path.moveTo(upper[0].x, upper[0].y);
  for (let i = 1; i < upper.length; i++) path.lineTo(upper[i].x, upper[i].y);
  for (let i = upper.length - 1; i >= 0; i--) path.lineTo(upper[i].x, canvasH - upper[i].y);
  path.closePath();
  return path;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function WaveformCanvas({
  peaks,
  duration,
  pxPerSec,
  scrollLeft,
  currentTime,
  comments,
  activeCommentIds,
  highlightedCommentId,
  selectedRange,
  hoveredEdge,
  loopRange,
  height = 300,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  globalDuration: _globalDuration,
  trackLabel,
  isActiveTrack = true,
  onSelectTrack,
  onDeleteTrack,
  onSeek,
  onRangeSelect,
  onClearRange,
  onCommentRangeChange,
  onCommentRangeChangeCommit,
  onCommentCmdClick,
  onCommentFocus,
  onWaveformContextMenu,
  onLoopRangeChange,
}: WaveformCanvasProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef     = useRef(0);
  const heightRef    = useRef(height);
  const rafRef       = useRef(0);

  const peaksRef          = useRef(peaks);              peaksRef.current          = peaks;
  const durationRef       = useRef(duration);           durationRef.current       = duration;
  const globalDurationRef = useRef(_globalDuration ?? 0); globalDurationRef.current = _globalDuration ?? 0;
  const pxPerSecRef       = useRef(pxPerSec);           pxPerSecRef.current       = pxPerSec;
  const scrollLeftRef     = useRef(scrollLeft);         scrollLeftRef.current     = scrollLeft;
  const currentTimeRef    = useRef(currentTime);        currentTimeRef.current    = currentTime;
  const renderDataRef  = useRef<RenderData>({ comments: [], activeCommentIds: new Set() });
  renderDataRef.current = { comments, activeCommentIds, highlightedCommentId };

  // Selection / drag refs (read inside compositeFrame without a dep)
  const selectionRef    = useRef<{ start: number; end: number } | null>(null);
  selectionRef.current  = selectedRange ?? null;
  const activeDragRef   = useRef<{ start: number; end: number } | null>(null);
  const dragStartRef    = useRef<{ x: number; time: number } | null>(null);

  // Stable callback refs (so closures in event listeners always see latest)
  const onSeekRef              = useRef(onSeek);              onSeekRef.current              = onSeek;
  const onRangeSelectRef       = useRef(onRangeSelect);       onRangeSelectRef.current       = onRangeSelect;
  const onCommentCmdClickRef   = useRef(onCommentCmdClick);   onCommentCmdClickRef.current   = onCommentCmdClick;
  const onCommentRangeChangeRef = useRef(onCommentRangeChange); onCommentRangeChangeRef.current = onCommentRangeChange;
  const onCommentRangeChangeCommitRef = useRef(onCommentRangeChangeCommit); onCommentRangeChangeCommitRef.current = onCommentRangeChangeCommit;
  const onCommentFocusRef       = useRef(onCommentFocus);       onCommentFocusRef.current       = onCommentFocus;
  const onWaveformContextMenuRef = useRef(onWaveformContextMenu); onWaveformContextMenuRef.current = onWaveformContextMenu;
  const onLoopRangeChangeRef     = useRef(onLoopRangeChange);    onLoopRangeChangeRef.current     = onLoopRangeChange;
  const loopRangeRef            = useRef(loopRange);           loopRangeRef.current            = loopRange;

  // Scrub mode: dragging the playhead seeks instead of range-selecting
  const scrubModeRef = useRef(false);

  // Captured at mousedown — whether a selection was active when the press began
  const pressedInsideSelectionRef = useRef(false);

  // Cooldown after clearing a selection — blocks the next mousedown for 220ms
  const clearRangeCooldownRef = useRef(false);
  const clearRangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClearRangeRef = useRef(onClearRange); onClearRangeRef.current = onClearRange;

  // Loop edge drag state
  const loopEdgeDragRef = useRef<{ side: "start" | "end"; fixedTime: number } | null>(null);

  // Edge drag state
  const edgeDragRef         = useRef<{ commentId: string; side: "start" | "end"; fixedTime: number } | null>(null);
  const edgeDragOriginalRef = useRef<number | null>(null); // original time of the dragged edge (for ghost)
  const hoveredEdgeRef      = useRef<{ commentId: string; side: "start" | "end"; time: number } | null>(null);
  hoveredEdgeRef.current    = hoveredEdge ?? null;

  // px from edge to trigger resize cursor / drag (reserved for future use)
  // const EDGE_HIT = 6;

  // ── Single offscreen buffer ───────────────────────────────────────────────
  // Baked at LOD_MIN_PPS (lower boundary of current tier) centered on the
  // current view.  scale = screenPPS / bakePPS is always ≥ 1 within a tier,
  // so the bake always over-covers the viewport — no blank edges.
  const baseOffscreenRef = useRef<OffscreenCanvas | null>(null);
  const pathRef          = useRef<Path2D | null>(null);
  const bakedStateRef    = useRef<BakedState | null>(null);

  // Cache for peaks padded with silence to match globalDuration.
  // Recomputed only when source peaks, track duration, or globalDuration changes.
  const paddedPeaksCacheRef = useRef<{
    sourcePeaks: Float32Array; sourceDur: number; globalDur: number;
    padded: Float32Array; paddedDur: number;
  } | null>(null);

  // LOD / zoom tracking
  const currentLodRef      = useRef<LodLevel | -1>(-1);
  const prevPxPerSecRef    = useRef(pxPerSec);
  const zoomingRef         = useRef(false);
  const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forward ref to scheduleDraw — set after scheduleDraw is defined below.
  // Used by compositeFrame's fallback to break the sync compositeFrame↔qualityDraw recursion.
  const scheduleDrawRef = useRef<((mode: DrawMode) => void) | null>(null);

  // ── Utility ───────────────────────────────────────────────────────────────
  function ensureCanvasSize(canvas: HTMLCanvasElement, w: number, h: number) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  /** Compute draw-image params from a baked state to the current screen. */
  function bakeToScreen(baked: BakedState, pps: number, sl: number, DPR: number) {
    const scale     = pps / baked.pps;
    const destX     = (baked.sl * scale - sl) * DPR;
    const destWidth = baked.canvasW * scale;
    const covers    = destX <= 1 && (destX + destWidth) >= baked.canvasW - 1;
    return { scale, destX, destWidth, covers };
  }

  // Ref so compositeFrame can call qualityDraw without a circular dep
  const qualityDrawRef = useRef<(() => void) | null>(null);

  // ── compositeFrame ────────────────────────────────────────────────────────
  //
  // Full-quality per-frame render (used for currentTime updates during playback):
  //   1. drawImage the bake with a horizontal scale transform
  //   2. Draw the played-region fill — clip in screen coords, path in bake coords
  //      (ctx.transform maps bake space → screen space so the path aligns)
  //   3. Draw the playhead line
  //
  // Falls back to qualityDraw if the bake no longer covers the view.
  // ─────────────────────────────────────────────────────────────────────────
  const compositeFrame = useCallback(() => {
    const baked = bakedStateRef.current;
    const base  = baseOffscreenRef.current;
    const path  = pathRef.current;
    if (!baked || !base || !path) { scheduleDrawRef.current?.("quality"); return; }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR     = window.devicePixelRatio || 1;
    const targetW = Math.round(widthRef.current  * DPR);
    const targetH = Math.round(heightRef.current * DPR);
    if (targetW === 0 || targetH === 0) return;

    ensureCanvasSize(canvas, targetW, targetH);

    const pps = pxPerSecRef.current;
    const sl  = scrollLeftRef.current;
    const { scale, destX, destWidth, covers } = bakeToScreen(baked, pps, sl, DPR);

    // Bake no longer covers the view (user panned beyond bake range) → rebuild
    if (!covers) { scheduleDrawRef.current?.("quality"); return; }

    ctx.clearRect(0, 0, targetW, targetH);

    // Layer 0.5: Subtle background highlight for the focused comment
    const hlId = renderDataRef.current.highlightedCommentId;
    if (hlId) {
      const hlComment = renderDataRef.current.comments.find(c => c.id === hlId);
      if (hlComment) {
        const regionEnd = hlComment.endTimestamp != null ? hlComment.endTimestamp : hlComment.timestamp + DEFAULT_REGION_DURATION;
        const rx0 = Math.max(0, (hlComment.timestamp * pps - sl) * DPR);
        const rx1 = Math.min(targetW, (regionEnd * pps - sl) * DPR);
        if (rx1 > rx0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
          ctx.fillRect(rx0, 0, rx1 - rx0, targetH);
        }
      }
    }

    // Layer 1: Bake (base waveform shape in unplayed grey)
    ctx.drawImage(base, 0, 0, baked.canvasW, baked.canvasH, destX, 0, destWidth, targetH);

    // Layer 2: Overlays (Played region + Comments)
    //   We transform to bake-space and clip to the path to ensure perfect alignment
    //   and consistent color blending across the entire waveform.
    ctx.save();
    ctx.transform(scale, 0, 0, 1, destX, 0);
    ctx.clip(path);

    // A. Played region — white fill overlay
    const playheadBakeX = (currentTimeRef.current * baked.pps - baked.sl) * DPR;
    if (playheadBakeX > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.fillRect(0, 0, playheadBakeX, baked.canvasH);
    }

    // B. Comment regions — solid blue (#0094ff)
    //   Drawn last so they are never lightened by the played-region overlay.
    for (const c of renderDataRef.current.comments) {
      const regionEnd = c.endTimestamp != null ? c.endTimestamp : c.timestamp + DEFAULT_REGION_DURATION;
      const bx0 = (c.timestamp * baked.pps - baked.sl) * DPR;
      const bx1 = (regionEnd   * baked.pps - baked.sl) * DPR;
      if (bx1 > bx0) {
        ctx.fillStyle = "#0094ff";
        ctx.fillRect(bx0, 0, bx1 - bx0, baked.canvasH);
        
        // Very subtle 1px "bars" on edges
        ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
        ctx.fillRect(bx0, 0, 1, baked.canvasH);
        ctx.fillRect(bx1 - 1, 0, 1, baked.canvasH);
      }
    }
    ctx.restore();

    // Layer 3: drag/selection region overlay (always on top)
    const sel = activeDragRef.current ?? selectionRef.current;
    if (sel) {
      const sx0 = Math.max(0, (sel.start * pps - sl) * DPR);
      const sx1 = Math.min(targetW, (sel.end   * pps - sl) * DPR);
      if (sx1 > sx0) {
        ctx.fillStyle = "rgba(0, 148, 255, 0.15)";
        ctx.fillRect(sx0, 0, sx1 - sx0, targetH);
        const edgeW = Math.max(1, Math.round(0.5 * DPR));
        ctx.fillStyle = "rgba(0, 148, 255, 0.5)";
        ctx.fillRect(sx0, 0, edgeW, targetH);
        ctx.fillRect(Math.min(sx1 - edgeW, targetW - edgeW), 0, edgeW, targetH);
      }
    }

    // Layer 3.5: Loop range overlay (amber)
    const loopR = loopRangeRef.current;
    if (loopR) {
      const lx0 = Math.max(0, (loopR.start * pps - sl) * DPR);
      const lx1 = Math.min(targetW, (loopR.end   * pps - sl) * DPR);
      if (lx1 > lx0) {
        ctx.fillStyle = "rgba(251, 191, 36, 0.15)";
        ctx.fillRect(lx0, 0, lx1 - lx0, targetH);
        const edgeW = Math.max(1, Math.round(0.5 * DPR));
        ctx.fillStyle = "rgba(251, 191, 36, 0.5)";
        ctx.fillRect(lx0, 0, edgeW, targetH);
        ctx.fillRect(Math.min(lx1 - edgeW, targetW - edgeW), 0, edgeW, targetH);
      }
    }

    // Layer 4: comment edge handles (hover bar / drag bar + ghost)
    const dragState = edgeDragRef.current;
    const origTime  = edgeDragOriginalRef.current;
    const hovered   = hoveredEdgeRef.current;

    if (dragState) {
      // Ghost line at the original position of the dragged edge
      if (origTime !== null) {
        const gx = Math.round((origTime * pps - sl) * DPR);
        if (gx >= -2 && gx <= targetW + 2) {
          ctx.fillStyle = "rgba(0, 148, 255, 0.3)";
          ctx.fillRect(gx - 0.5 * DPR, 0, 1 * DPR, targetH);
        }
      }
      // Active drag circle: position from updated comment state
      const dragged = renderDataRef.current.comments.find(c => c.id === dragState.commentId);
      if (dragged) {
        const curTime = dragState.side === "start"
          ? dragged.timestamp
          : (dragged.endTimestamp != null ? dragged.endTimestamp : dragged.timestamp + DEFAULT_REGION_DURATION);
        const dx = Math.round((curTime * pps - sl) * DPR);
        if (dx >= -4 * DPR && dx <= targetW + 4 * DPR) {
          ctx.beginPath();
          ctx.arc(dx, targetH / 2, 4 * DPR, 0, Math.PI * 2);
          ctx.fillStyle = "#0094ff";
          ctx.fill();
        }
      }
    } else if (hovered) {
      // Hover handle circle (no drag active) — much more subtle, no bar
      const hx = Math.round((hovered.time * pps - sl) * DPR);
      if (hx >= -4 * DPR && hx <= targetW + 4 * DPR) {
        ctx.beginPath();
        ctx.arc(hx, targetH / 2, 4 * DPR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 148, 255, 0.6)";
        ctx.fill();
      }
    }
  }, []);

  // ── qualityDraw ───────────────────────────────────────────────────────────
  //
  // Rebuilds the bake at LOD_MIN_PPS centered on the current viewport.
  // Because bakePPS is the tier's lower bound, any screen zoom within the
  // tier produces scale ∈ [1, 4), guaranteeing full viewport coverage.
  // ─────────────────────────────────────────────────────────────────────────
  const qualityDraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const DPR     = window.devicePixelRatio || 1;
    const w       = widthRef.current;
    const h       = heightRef.current;
    const targetW = Math.round(w * DPR);
    const targetH = Math.round(h * DPR);
    if (targetW === 0 || targetH === 0) return;

    ensureCanvasSize(canvas, targetW, targetH);

    const rawPeaks  = peaksRef.current;
    const rawDur    = durationRef.current;
    const globalDur = globalDurationRef.current;
    const pps       = pxPerSecRef.current;
    const sl        = scrollLeftRef.current;

    if (rawPeaks.length === 0 || rawDur <= 0 || pps <= 0) {
      canvas.getContext("2d")?.clearRect(0, 0, targetW, targetH);
      return;
    }

    // Pad peaks with silence to match globalDuration so the waveform fills the
    // full shared timeline. Cached so we don't allocate on every bake.
    let peakData = rawPeaks;
    let dur      = rawDur;
    if (globalDur > rawDur) {
      const cache = paddedPeaksCacheRef.current;
      if (
        !cache ||
        cache.sourcePeaks !== rawPeaks ||
        cache.sourceDur   !== rawDur   ||
        cache.globalDur   !== globalDur
      ) {
        const totalSamples = Math.round(rawPeaks.length * globalDur / rawDur);
        const padded = new Float32Array(totalSamples); // zero-filled = silence
        padded.set(rawPeaks);
        paddedPeaksCacheRef.current = {
          sourcePeaks: rawPeaks, sourceDur: rawDur, globalDur,
          padded, paddedDur: globalDur,
        };
      }
      peakData = paddedPeaksCacheRef.current!.padded;
      dur      = globalDur;
    }

    const N = peakData.length;

    const basePPS = w / dur;
    const lod     = getLodLevel(pps, basePPS);

    // ── Compute bake PPS and scroll ───────────────────────────────────────
    // During an active zoom gesture we bake at the tier's lower boundary PPS
    // so scale = currentPPS / bakePPS ∈ [1, 4) — the bake always over-covers
    // the viewport (no black edges while the gesture is in flight).
    //
    // Once the gesture settles we bake at exactly currentPPS → scale = 1 →
    // pixel-perfect, vector-quality rendering.  No stretching, no blur.
    const bakePPS   = zoomingRef.current ? LOD_MIN_RATIO[lod] * basePPS : pps;
    const centerT   = (sl + w / 2) / pps;
    const maxBakeSL = Math.max(0, dur * bakePPS - w);
    const bakeSL    = Math.max(0, Math.min(centerT * bakePPS - w / 2, maxBakeSL));

    const deviceStep = Math.max(1, Math.round(LOD_STEP_CSS[lod] * DPR));
    const fullPath   = buildWaveformPath(peakData, N, dur, bakePPS, bakeSL, targetW, targetH, DPR, deviceStep);
    pathRef.current  = fullPath;

    // ── Bake Layer 1 (Base Waveform) to offscreen ─────────────────────────
    if (
      !baseOffscreenRef.current ||
      baseOffscreenRef.current.width  !== targetW ||
      baseOffscreenRef.current.height !== targetH
    ) {
      baseOffscreenRef.current = new OffscreenCanvas(targetW, targetH);
    }
    const offCtx = baseOffscreenRef.current.getContext("2d")!;
    offCtx.clearRect(0, 0, targetW, targetH);

    offCtx.fillStyle = "rgba(255, 255, 255, 0.20)";
    offCtx.fill(fullPath);

    bakedStateRef.current = { pps: bakePPS, sl: bakeSL, lod, canvasW: targetW, canvasH: targetH };

    // Composite layer 2 (played) + playhead onto the fresh bake
    compositeFrame();
  }, [compositeFrame]);

  qualityDrawRef.current = qualityDraw;

  // ── fastDraw ──────────────────────────────────────────────────────────────
  //
  // O(1) zoom preview: scale-blit the bake + fresh playhead.
  // No played-region path redraw (that's compositeFrame's job).
  // Falls back to qualityDraw only if the bake somehow lost coverage.
  // ─────────────────────────────────────────────────────────────────────────
  const fastDraw = useCallback(() => {
    const baked = bakedStateRef.current;
    const base  = baseOffscreenRef.current;
    if (!baked || !base) { qualityDraw(); return; }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR     = window.devicePixelRatio || 1;
    const targetW = Math.round(widthRef.current  * DPR);
    const targetH = Math.round(heightRef.current * DPR);
    if (targetW === 0 || targetH === 0) return;

    ensureCanvasSize(canvas, targetW, targetH);

    const pps = pxPerSecRef.current;
    const sl  = scrollLeftRef.current;
    const { destX, destWidth, covers } = bakeToScreen(baked, pps, sl, DPR);

    if (!covers) { qualityDraw(); return; }

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(base, 0, 0, baked.canvasW, baked.canvasH, destX, 0, destWidth, targetH);

    const sel = activeDragRef.current ?? selectionRef.current;
    if (sel) {
      const sx0 = Math.max(0, (sel.start * pps - sl) * DPR);
      const sx1 = Math.min(targetW, (sel.end   * pps - sl) * DPR);
      if (sx1 > sx0) {
        ctx.fillStyle = "rgba(0, 148, 255, 0.15)";
        ctx.fillRect(sx0, 0, sx1 - sx0, targetH);
        const edgeW = Math.round(2 * DPR);
        ctx.fillStyle = "rgba(0, 148, 255, 0.75)";
        ctx.fillRect(sx0, 0, edgeW, targetH);
        ctx.fillRect(Math.min(sx1 - edgeW, targetW - edgeW), 0, edgeW, targetH);
      }
    }

    // Loop range overlay
    const loopRf = loopRangeRef.current;
    if (loopRf) {
      const lx0 = Math.max(0, (loopRf.start * pps - sl) * DPR);
      const lx1 = Math.min(targetW, (loopRf.end   * pps - sl) * DPR);
      if (lx1 > lx0) {
        ctx.fillStyle = "rgba(251, 191, 36, 0.15)";
        ctx.fillRect(lx0, 0, lx1 - lx0, targetH);
        const edgeW = Math.max(1, Math.round(0.5 * DPR));
        ctx.fillStyle = "rgba(251, 191, 36, 0.5)";
        ctx.fillRect(lx0, 0, edgeW, targetH);
        ctx.fillRect(Math.min(lx1 - edgeW, targetW - edgeW), 0, edgeW, targetH);
      }
    }

    // Edge handles (same as compositeFrame, so they persist during zoom)
    const fDrag    = edgeDragRef.current;
    const fOrig    = edgeDragOriginalRef.current;
    const fHovered = hoveredEdgeRef.current;
    if (fDrag) {
      if (fOrig !== null) {
        const gx = Math.round((fOrig * pps - sl) * DPR);
        if (gx >= -2 && gx <= targetW + 2) {
          ctx.fillStyle = "rgba(0, 148, 255, 0.35)";
          ctx.fillRect(gx - DPR, 0, 2 * DPR, targetH);
        }
      }
      const dragged = renderDataRef.current.comments.find(c => c.id === fDrag.commentId);
      if (dragged) {
        const curTime = fDrag.side === "start"
          ? dragged.timestamp
          : (dragged.endTimestamp != null ? dragged.endTimestamp : dragged.timestamp + DEFAULT_REGION_DURATION);
        const dx = Math.round((curTime * pps - sl) * DPR);
        if (dx >= -4 * DPR && dx <= targetW + 4 * DPR) {
          const barW = Math.round(3 * DPR);
          ctx.fillStyle = "#0094ff";
          ctx.fillRect(dx - Math.floor(barW / 2), 0, barW, targetH);
          ctx.beginPath();
          ctx.arc(dx, targetH / 2, 5 * DPR, 0, Math.PI * 2);
          ctx.fillStyle = "#0094ff";
          ctx.fill();
        }
      }
    } else if (fHovered) {
      const hx = Math.round((fHovered.time * pps - sl) * DPR);
      if (hx >= -4 * DPR && hx <= targetW + 4 * DPR) {
        const barW = Math.round(3 * DPR);
        ctx.fillStyle = "rgba(0, 148, 255, 0.85)";
        ctx.fillRect(hx - Math.floor(barW / 2), 0, barW, targetH);
        ctx.beginPath();
        ctx.arc(hx, targetH / 2, 5 * DPR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 148, 255, 0.85)";
        ctx.fill();
      }
    }
  }, [qualityDraw]);

  // ── scheduleDraw ──────────────────────────────────────────────────────────
  const scheduleDraw = useCallback((mode: DrawMode) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if      (mode === "composite") compositeFrame();
      else if (mode === "fast")      fastDraw();
      else                           qualityDraw();
    });
  }, [compositeFrame, fastDraw, qualityDraw]);

  scheduleDrawRef.current = scheduleDraw;

  // ── pxPerSec effect ───────────────────────────────────────────────────────
  // LOD boundary crossed → immediate quality rebake (new tier, new precision).
  // Within same tier    → GPU scale blit + 50 ms settle debounce.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const basePPS    = durationRef.current > 0 ? widthRef.current / durationRef.current : 1;
    const newLod     = getLodLevel(pxPerSec, basePPS);
    const didZoom    = Math.abs(pxPerSec - prevPxPerSecRef.current) > 0.001;
    const lodCrossed = newLod !== currentLodRef.current && currentLodRef.current !== -1;

    prevPxPerSecRef.current = pxPerSec;
    currentLodRef.current   = newLod;

    if (!didZoom) return;

    zoomingRef.current = true;
    clearTimeout(zoomSettleTimerRef.current ?? undefined);

    scheduleDraw(lodCrossed ? "quality" : "fast");

    zoomSettleTimerRef.current = setTimeout(() => {
      zoomingRef.current = false;
      scheduleDraw("quality");
    }, 50);

    return () => clearTimeout(zoomSettleTimerRef.current ?? undefined);
  }, [pxPerSec, scheduleDraw]);

  // scrollLeft: coupled to zoom → fast; pure pan → quality (re-centers bake)
  useEffect(() => {
    scheduleDraw(zoomingRef.current ? "fast" : "quality");
  }, [scrollLeft, scheduleDraw]);

  // currentTime: only played region / playhead changes → cheapest path
  useEffect(() => {
    scheduleDraw("composite");
  }, [currentTime, scheduleDraw]);


  // Comments: baked into offscreen → invalidate + rebuild
  useEffect(() => {
    bakedStateRef.current = null;
    pathRef.current       = null;
    scheduleDraw("quality");
  }, [comments, activeCommentIds, scheduleDraw]);

  // highlightedCommentId / selectedRange / hoveredEdge / loopRange: overlay-only changes → composite redraw
  useEffect(() => {
    scheduleDraw("composite");
  }, [highlightedCommentId, selectedRange, hoveredEdge, loopRange, scheduleDraw]);

  // Peaks / duration: full invalidation
  useEffect(() => {
    bakedStateRef.current     = null;
    pathRef.current           = null;
    currentLodRef.current     = -1;
    paddedPeaksCacheRef.current = null;
    scheduleDraw("quality");
  }, [peaks, duration, scheduleDraw]);

  // globalDuration: invalidate padded-peaks cache and rebake so the silence
  // padding updates when a new (longer) comparison track is added.
  useEffect(() => {
    bakedStateRef.current     = null;
    pathRef.current           = null;
    paddedPeaksCacheRef.current = null;
    scheduleDraw("quality");
  }, [_globalDuration, scheduleDraw]);

  // Container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        for (const entry of entries) {
          widthRef.current  = entry.contentRect.width;
          heightRef.current = entry.contentRect.height;
        }
        bakedStateRef.current = null;
        pathRef.current       = null;
        qualityDraw();
      });
    });

    ro.observe(container);
    widthRef.current  = container.clientWidth;
    heightRef.current = container.clientHeight;
    return () => ro.disconnect();
  }, [qualityDraw]);

  // Cursor handling only (also detects loop edge hover)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragStartRef.current || edgeDragRef.current || loopEdgeDragRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    // Loop range edge hover
    const loopR = loopRangeRef.current;
    if (loopR && pxPerSecRef.current > 0) {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const loopStartX = loopR.start * pxPerSecRef.current - scrollLeftRef.current;
      const loopEndX   = loopR.end   * pxPerSecRef.current - scrollLeftRef.current;
      if (Math.abs(mouseX - loopStartX) <= 6 || Math.abs(mouseX - loopEndX) <= 6) {
        container.style.cursor = "ew-resize";
        return;
      }
    }

    if (hoveredEdgeRef.current) {
      container.style.cursor = "ew-resize";
    } else {
      container.style.cursor = "";
    }
  }, []);

  // Context menu (right-click)
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (edgeDragRef.current || loopEdgeDragRef.current || dragStartRef.current) return;
    const container = containerRef.current;
    if (!container || durationRef.current <= 0 || pxPerSecRef.current <= 0) return;

    const rect = container.getBoundingClientRect();
    const rawTime = (e.clientX - rect.left + scrollLeftRef.current) / pxPerSecRef.current;
    const time = Math.max(0, Math.min(rawTime, durationRef.current));

    // Priority 1: inside selected range
    const sel = selectionRef.current;
    if (sel && time >= sel.start && time <= sel.end) {
      onWaveformContextMenuRef.current?.({ x: e.clientX, y: e.clientY, type: "selection", range: sel });
      return;
    }

    // Priority 2: comment hit-test
    const hit = renderDataRef.current.comments.find((c) => {
      const end = c.endTimestamp != null ? c.endTimestamp : c.timestamp + DEFAULT_REGION_DURATION;
      return time >= c.timestamp && time <= end;
    });
    if (hit) {
      onWaveformContextMenuRef.current?.({ x: e.clientX, y: e.clientY, type: "comment", comment: hit });
      return;
    }

    // Priority 3: empty waveform
    onWaveformContextMenuRef.current?.({ x: e.clientX, y: e.clientY, type: "empty", time });
  }, []);

  // Drag-to-select / click-to-seek / Cmd+click / edge-resize
  // Playhead is placed on mouse-UP so a drag commits cleanly.
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // ignore right-click
    const container = containerRef.current;
    if (!container || durationRef.current <= 0) return;

    const getTime = (clientX: number) => {
      const r = container.getBoundingClientRect();
      const wx = (clientX - r.left) + scrollLeftRef.current;
      return Math.max(0, Math.min(wx / pxPerSecRef.current, durationRef.current));
    };

    // Capture at mousedown whether a selection was active (any click clears it)
    pressedInsideSelectionRef.current = selectionRef.current != null;

    // ── 0. Loop range edge drag ──
    const loopR = loopRangeRef.current;
    if (loopR && pxPerSecRef.current > 0) {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const loopStartX = loopR.start * pxPerSecRef.current - scrollLeftRef.current;
      const loopEndX   = loopR.end   * pxPerSecRef.current - scrollLeftRef.current;
      const LOOP_EDGE_HIT = 6;
      if (Math.abs(mouseX - loopStartX) <= LOOP_EDGE_HIT || Math.abs(mouseX - loopEndX) <= LOOP_EDGE_HIT) {
        const side = Math.abs(mouseX - loopStartX) <= LOOP_EDGE_HIT ? "start" : "end";
        const fixedTime = side === "start" ? loopR.end : loopR.start;
        loopEdgeDragRef.current = { side, fixedTime };
        container.style.cursor = "ew-resize";

        let cancelled = false;

        const onLoopMove = (me: MouseEvent) => {
          if (cancelled) return;
          const t = getTime(me.clientX);
          const crossedOver = side === "start" ? t >= fixedTime : t <= fixedTime;
          if (crossedOver) {
            cancelled = true;
            onLoopRangeChangeRef.current?.(null);
            if (containerRef.current) containerRef.current.style.cursor = "";
            loopEdgeDragRef.current = null;
            scheduleDraw("composite");
            return;
          }
          if (side === "start") {
            onLoopRangeChangeRef.current?.({ start: t, end: fixedTime });
          } else {
            onLoopRangeChangeRef.current?.({ start: fixedTime, end: t });
          }
          scheduleDraw("composite");
        };

        const onLoopUp = () => {
          window.removeEventListener("mousemove", onLoopMove);
          window.removeEventListener("mouseup", onLoopUp);
          if (containerRef.current) containerRef.current.style.cursor = "";
          loopEdgeDragRef.current = null;
          scheduleDraw("composite");
        };

        window.addEventListener("mousemove", onLoopMove);
        window.addEventListener("mouseup", onLoopUp);
        return;
      }
    }

    // ── 0.5. Playhead scrub ──
    // Skip if any selection is active — clicking should clear it, not scrub.
    const PLAYHEAD_HIT = 8;
    const playheadX = currentTimeRef.current * pxPerSecRef.current - scrollLeftRef.current;
    const mouseX0 = e.clientX - container.getBoundingClientRect().left;
    if (!pressedInsideSelectionRef.current && Math.abs(mouseX0 - playheadX) <= PLAYHEAD_HIT) {
      const onScrubMove = (me: MouseEvent) => {
        onSeekRef.current?.(getTime(me.clientX));
        scheduleDraw("composite");
      };
      const onScrubUp = (me: MouseEvent) => {
        window.removeEventListener("mousemove", onScrubMove);
        window.removeEventListener("mouseup", onScrubUp);
        onSeekRef.current?.(getTime(me.clientX));
        scheduleDraw("composite");
      };
      window.addEventListener("mousemove", onScrubMove);
      window.addEventListener("mouseup", onScrubUp);
      return;
    }

    // ── 1. Cmd+click: focus comment ──
    if (e.metaKey || e.ctrlKey) {
      const t = getTime(e.clientX);
      const hit = renderDataRef.current.comments.find((c) => {
        const end = c.endTimestamp != null ? c.endTimestamp : c.timestamp + DEFAULT_REGION_DURATION;
        return t >= c.timestamp && t <= end;
      });
      if (hit) { onCommentCmdClickRef.current?.(hit); return; }
    }

    // ── 2. Edge drag: resize comment region ──
    const currentHovered = hoveredEdgeRef.current;
    if (currentHovered) {
      const c = renderDataRef.current.comments.find(c => c.id === currentHovered.commentId);
      if (c) {
        const regionEnd = c.endTimestamp != null ? c.endTimestamp : c.timestamp + DEFAULT_REGION_DURATION;
        const side = currentHovered.side;
        const fixedTime = side === "start" ? regionEnd : c.timestamp;

        edgeDragRef.current         = { commentId: c.id, side, fixedTime };
        edgeDragOriginalRef.current = side === "start" ? c.timestamp : regionEnd;
        container.style.cursor      = "ew-resize";
        onCommentFocusRef.current?.(c.id);

        const onEdgeMove = (me: MouseEvent) => {
          const d = edgeDragRef.current;
          if (!d) return;
          const t = getTime(me.clientX);
          if (d.side === "start") {
            onCommentRangeChangeRef.current?.(d.commentId, Math.min(t, d.fixedTime - 0.5), d.fixedTime);
          } else {
            onCommentRangeChangeRef.current?.(d.commentId, d.fixedTime, Math.max(t, d.fixedTime + 0.5));
          }
          scheduleDraw("composite");
        };

        const onEdgeUp = (me: MouseEvent) => {
          const d = edgeDragRef.current;
          if (d) {
            const t = getTime(me.clientX);
            const start = d.side === "start" ? Math.min(t, d.fixedTime - 0.5) : d.fixedTime;
            const end   = d.side === "start" ? d.fixedTime : Math.max(t, d.fixedTime + 0.5);
            onCommentRangeChangeCommitRef.current?.(d.commentId, start, end);
          }
          window.removeEventListener("mousemove", onEdgeMove);
          window.removeEventListener("mouseup", onEdgeUp);
          if (containerRef.current) containerRef.current.style.cursor = "";
          edgeDragRef.current         = null;
          edgeDragOriginalRef.current = null;
          scheduleDraw("composite");
        };

        window.addEventListener("mousemove", onEdgeMove);
        window.addEventListener("mouseup", onEdgeUp);
        return;
      }
    }

    // ── 3. Normal drag-to-select / click-to-seek ──
    dragStartRef.current = { x: e.clientX, time: getTime(e.clientX) };

    const onMove = (me: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start || Math.abs(me.clientX - start.x) < 4) return;
      const endT = getTime(me.clientX);
      activeDragRef.current = {
        start: Math.min(start.time, endT),
        end:   Math.max(start.time, endT),
      };
      scheduleDraw("composite");
    };

    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (containerRef.current) containerRef.current.style.cursor = "";

      const start = dragStartRef.current;
      const drag  = activeDragRef.current;
      dragStartRef.current  = null;
      activeDragRef.current = null;

      if (!start) return;
      if (me.button !== 0) return;

      const wasInsideSel = pressedInsideSelectionRef.current;
      pressedInsideSelectionRef.current = false;

      if (drag && Math.abs(me.clientX - start.x) >= 4) {
        onRangeSelectRef.current?.(drag.start, drag.end);
      } else if (wasInsideSel && !clearRangeCooldownRef.current) {
        // Press started inside selection — clear it, don't seek.
        // Ignore for 220ms after to absorb any trailing double-click event.
        onClearRangeRef.current?.();
        clearRangeCooldownRef.current = true;
        clearRangeTimerRef.current = setTimeout(() => {
          clearRangeCooldownRef.current = false;
          clearRangeTimerRef.current = null;
        }, 220);
      } else if (!wasInsideSel && !clearRangeCooldownRef.current) {
        onSeekRef.current?.(getTime(me.clientX));
      }
      scheduleDraw("composite");
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [scheduleDraw]); // callbacks via stable refs, scheduleDraw is stable

  // Touch handlers for seek, scrub, and region selection
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const container = containerRef.current;
    if (!container || durationRef.current <= 0) return;
    const r = container.getBoundingClientRect();
    const wx = (touch.clientX - r.left) + scrollLeftRef.current;
    const t = Math.max(0, Math.min(wx / pxPerSecRef.current, durationRef.current));
    // Capture whether a selection was active at touch start (any tap clears it)
    const hadSelection = selectionRef.current != null;
    pressedInsideSelectionRef.current = hadSelection;
    // Detect playhead hit (larger touch target), but not when selection will be cleared
    const PLAYHEAD_HIT = 14;
    const playheadX = currentTimeRef.current * pxPerSecRef.current - scrollLeftRef.current;
    scrubModeRef.current = !hadSelection && Math.abs(touch.clientX - r.left - playheadX) <= PLAYHEAD_HIT;
    dragStartRef.current = { x: touch.clientX, time: t };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const start = dragStartRef.current;
    if (!start) return;
    const container = containerRef.current;
    if (!container) return;
    const r = container.getBoundingClientRect();
    const wx = (touch.clientX - r.left) + scrollLeftRef.current;
    const endT = Math.max(0, Math.min(wx / pxPerSecRef.current, durationRef.current));
    if (scrubModeRef.current) {
      onSeekRef.current?.(endT);
      scheduleDraw("composite");
      return;
    }
    if (Math.abs(touch.clientX - start.x) < 4) return;
    activeDragRef.current = {
      start: Math.min(start.time, endT),
      end: Math.max(start.time, endT),
    };
    scheduleDraw("composite");
  }, [scheduleDraw]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const changedTouch = e.changedTouches[0];
    const start = dragStartRef.current;
    const drag = activeDragRef.current;
    const wasScrub = scrubModeRef.current;
    dragStartRef.current = null;
    activeDragRef.current = null;
    scrubModeRef.current = false;
    if (!start || !changedTouch) return;
    if (wasScrub) {
      scheduleDraw("composite");
      return;
    }
    const wasInsideSel = pressedInsideSelectionRef.current;
    pressedInsideSelectionRef.current = false;

    if (drag && Math.abs(changedTouch.clientX - start.x) >= 4) {
      onRangeSelectRef.current?.(drag.start, drag.end);
    } else if (wasInsideSel && !clearRangeCooldownRef.current) {
      onClearRangeRef.current?.();
      clearRangeCooldownRef.current = true;
      clearRangeTimerRef.current = setTimeout(() => {
        clearRangeCooldownRef.current = false;
        clearRangeTimerRef.current = null;
      }, 220);
    } else if (!wasInsideSel && !clearRangeCooldownRef.current) {
      const container = containerRef.current;
      if (!container || durationRef.current <= 0) return;
      const r = container.getBoundingClientRect();
      const wx = (changedTouch.clientX - r.left) + scrollLeftRef.current;
      const t = Math.max(0, Math.min(wx / pxPerSecRef.current, durationRef.current));
      onSeekRef.current?.(t);
    }
    scheduleDraw("composite");
  }, [scheduleDraw]);

  return (
    <div
      ref={containerRef}
      className="waveform-canvas-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { if (!edgeDragRef.current && containerRef.current) containerRef.current.style.cursor = ""; }}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ width: "100%", flex: 1, minHeight: 0, position: "relative" }}
    >
      <canvas ref={canvasRef} className="waveform-canvas" />
      {trackLabel && (
        <div
          className={`waveform-overlay-tag${isActiveTrack ? " waveform-overlay-tag--active" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            className="waveform-overlay-tag__radio"
            onClick={onSelectTrack}
            title={isActiveTrack ? "Active track" : "Click to select"}
          >
            <span className={`waveform-overlay-tag__dot${isActiveTrack ? " waveform-overlay-tag__dot--filled" : ""}`} />
          </button>
          <span className="waveform-overlay-tag__label" onClick={onSelectTrack}>{trackLabel}</span>
          {onDeleteTrack && (
            <button
              className="waveform-overlay-tag__delete"
              onClick={onDeleteTrack}
              title="Remove track"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
