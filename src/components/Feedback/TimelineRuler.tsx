interface TimelineRulerProps {
  duration: number;
  scrollLeft: number;
  pxPerSec: number;
  onSeek?: (time: number) => void;
  onTimelineContextMenu?: (x: number, y: number, time: number) => void;
}

export default function TimelineRuler({ duration, scrollLeft, pxPerSec, onSeek, onTimelineContextMenu }: TimelineRulerProps) {
  if (duration <= 0 || pxPerSec <= 0) return null;

  // Determine label interval (always at 5-second boundaries)
  const pxPer5s = 5 * pxPerSec;
  let labelInterval = 5; // seconds
  if (pxPer5s < 50) labelInterval = 10;
  if (pxPer5s < 25) labelInterval = 15;
  if (pxPer5s < 15) labelInterval = 30;
  if (pxPer5s < 8) labelInterval = 60;

  const viewportWidth = window.innerWidth;
  const viewStartTime = scrollLeft / pxPerSec;
  const viewEndTime = (scrollLeft + viewportWidth) / pxPerSec;

  // Find first label before viewport start
  const firstLabel = Math.floor(viewStartTime / labelInterval) * labelInterval;

  const elements: React.ReactNode[] = [];

  for (let t = Math.max(labelInterval, firstLabel); t <= Math.min(duration, viewEndTime + labelInterval); t += labelInterval) {
    const viewportX = t * pxPerSec - scrollLeft;
    if (viewportX < -80 || viewportX > viewportWidth + 80) continue;

    // Format label as full time: "30s", "1m", "1m 30s", etc.
    let label: string;
    const mins = Math.floor(t / 60);
    const secs = t % 60;
    if (mins > 0 && secs > 0) {
      label = `${mins}m ${secs}s`;
    } else if (mins > 0) {
      label = `${mins}m`;
    } else {
      label = `${secs}s`;
    }

    elements.push(
      <span key={`l-${t}`} className="timeline-ruler__label" style={{ left: viewportX }}>
        {label}
      </span>
    );

    // 3 dots between this label and the next
    const dotSpacing = labelInterval / 4;
    for (let d = 1; d <= 3; d++) {
      const dotTime = t + d * dotSpacing;
      if (dotTime > duration) break;
      const dotX = dotTime * pxPerSec - scrollLeft;
      if (dotX < -10 || dotX > viewportWidth + 10) continue;
      elements.push(
        <span key={`d-${t}-${d}`} className="timeline-ruler__dot" style={{ left: dotX }}>
          ·
        </span>
      );
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const absX = x + scrollLeft;
    const time = absX / pxPerSec;
    onSeek?.(Math.max(0, Math.min(duration, time)));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(duration, (x + scrollLeft) / pxPerSec));
    onTimelineContextMenu?.(e.clientX, e.clientY, time);
  };

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className="timeline-ruler"
    >
      {elements}
    </div>
  );
}
