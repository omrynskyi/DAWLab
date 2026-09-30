import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

interface WaveformMinimapProps {
  peaks: Float32Array;
  duration: number;       // global max duration across all tracks
  activeDuration: number; // active track's own duration (≤ duration)
  scrollLeft: number;
  pxPerSec: number;
  containerWidth: number;
  onUpdateView: (scrollLeft: number, pxPerSec: number) => void;
  visible: boolean;
}

export default function WaveformMinimap({
  peaks,
  duration,
  activeDuration,
  scrollLeft,
  pxPerSec,
  containerWidth,
  onUpdateView,
  visible
}: WaveformMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<"pan" | "left" | "right" | null>(null);
  const dragStartRef = useRef<{ x: number; sl: number; pps: number; startX: number; endX: number }>({ x: 0, sl: 0, pps: 0, startX: 0, endX: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || peaks.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w_raw = canvas.offsetWidth;
    const h_raw = canvas.offsetHeight;
    if (w_raw === 0 || h_raw === 0) return;

    const DPR = window.devicePixelRatio || 1;
    const w = w_raw * DPR;
    const h = h_raw * DPR;

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // How much of the canvas the active track occupies (< 1 when it's shorter
    // than the longest loaded track).
    const activeFraction = duration > 0 ? Math.min(1, activeDuration / duration) : 1;
    const activeW = Math.round(w * activeFraction);

    // Normalize peaks
    let max = 0;
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i] > max) max = peaks[i];
    }
    const scale = max > 0 ? 0.9 / max : 1;
    const midY = h / 2;

    // Draw active-track waveform up to activeW
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1 * DPR;
    ctx.beginPath();
    for (let i = 0; i < activeW; i++) {
      const peakIdx = Math.floor((i / activeW) * peaks.length);
      const val = (peaks[peakIdx] || 0) * scale;
      const barH = Math.max(2 * DPR, val * h);
      ctx.moveTo(i, midY - barH / 2);
      ctx.lineTo(i, midY + barH / 2);
    }
    ctx.stroke();

    // Draw a dim line for the silent region beyond the active track's end
    if (activeW < w) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(activeW, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
    }
  }, [peaks, duration, activeDuration, visible]);

  // Redraw when peaks, durations, or visibility change
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(draw, 100); // Wait for animation to settle
      return () => clearTimeout(timer);
    }
  }, [draw, visible, activeDuration]);

  // Handle Resize
  useEffect(() => {
    if (!canvasRef.current || !visible) return;
    const obs = new ResizeObserver(() => draw());
    obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [draw, visible]);

  // ── Viewport calculations ──
  const viewWidthTime = containerWidth / pxPerSec;
  const viewportStartPercent = (scrollLeft / pxPerSec) / duration;
  const viewportEndPercent = ((scrollLeft / pxPerSec) + viewWidthTime) / duration;

  const leftPos = Math.max(0, viewportStartPercent * 100);
  const rightPos = Math.max(0, (1 - viewportEndPercent) * 100);

  const handleMouseDown = (type: "pan" | "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(type);
    dragStartRef.current = {
      x: e.clientX,
      sl: scrollLeft,
      pps: pxPerSec,
      startX: (scrollLeft / pxPerSec / duration) * containerWidth,
      endX: ((scrollLeft / pxPerSec + viewWidthTime) / duration) * containerWidth
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const totalW = containerWidth;
      
      if (isDragging === "pan") {
        const timeDelta = (deltaX / totalW) * duration;
        const newSL = (dragStartRef.current.sl / dragStartRef.current.pps + timeDelta) * pxPerSec;
        onUpdateView(newSL, pxPerSec);
      } else if (isDragging === "left") {
        const newStartX = Math.max(0, Math.min(dragStartRef.current.startX + deltaX, dragStartRef.current.endX - 20));
        const newStartTime = (newStartX / totalW) * duration;
        const endTime = (dragStartRef.current.endX / totalW) * duration;
        const newViewTime = endTime - newStartTime;
        const newPPS = containerWidth / newViewTime;
        onUpdateView(newStartTime * newPPS, newPPS);
      } else if (isDragging === "right") {
        const newEndX = Math.min(totalW, Math.max(dragStartRef.current.endX + deltaX, dragStartRef.current.startX + 20));
        const startTime = (dragStartRef.current.startX / totalW) * duration;
        const newEndTime = (newEndX / totalW) * duration;
        const newViewTime = newEndTime - startTime;
        const newPPS = containerWidth / newViewTime;
        onUpdateView(startTime * newPPS, newPPS);
      }
    };

    const handleMouseUp = () => setIsDragging(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, duration, containerWidth, pxPerSec, onUpdateView]);

  return (
    <div className="waveform-minimap-container" ref={containerRef}>
      <AnimatePresence>
        {visible && (
          <motion.div 
            initial={{ height: 0, opacity: 0, marginBottom: 0 }}
            animate={{ height: 40, opacity: 1, marginBottom: 12 }}
            exit={{ height: 0, opacity: 0, marginBottom: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="waveform-minimap"
          >
            <canvas ref={canvasRef} className="waveform-minimap__canvas" />
            
            {/* Viewport Brush */}
            <div 
              className={`waveform-minimap__brush ${isDragging ? 'is-dragging' : ''}`}
              style={{ left: `${leftPos}%`, right: `${rightPos}%` }}
              onMouseDown={(e) => handleMouseDown("pan", e)}
            >
              <div 
                className="waveform-minimap__handle handle-left" 
                onMouseDown={(e) => handleMouseDown("left", e)} 
              />
              <div 
                className="waveform-minimap__handle handle-right" 
                onMouseDown={(e) => handleMouseDown("right", e)} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
