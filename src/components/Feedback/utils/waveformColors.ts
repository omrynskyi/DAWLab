import type { Comment } from "../CommentCard";

/** Deterministic hue from author name */
export function getAuthorHue(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 33) ^ name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/** Vivid blue for the active (top-of-group) comment region */
export function activeColor(): string {
  return "#0094ff";
}

/** Dimmed blue for hidden (side) comments in a group */
export function hiddenColor(): string {
  return "rgba(0, 148, 255, 0.45)";
}

/** Default bar color -- bright white-ish for non-commented regions */
export const DEFAULT_COLOR = "rgba(255, 255, 255, 0.60)";

/** Duration of a comment region when no endTimestamp is given (seconds) */
export const DEFAULT_REGION_DURATION = 3;

export interface RenderData {
  comments: Comment[];
  activeCommentIds: Set<string>;
  highlightedCommentId?: string | null;
}

export function getBarColor(t: number, data: RenderData): string {
  let vivid: string | null = null;
  let muted: string | null = null;

  for (const c of data.comments) {
    const end = c.endTimestamp != null ? c.endTimestamp : c.timestamp + DEFAULT_REGION_DURATION;
    if (t >= c.timestamp && t <= end) {
      if (data.activeCommentIds.has(c.id)) {
        if (!vivid) vivid = activeColor();
      } else {
        if (!muted) muted = hiddenColor();
      }
    }
  }
  return vivid ?? muted ?? DEFAULT_COLOR;
}
