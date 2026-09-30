import { useRef, useMemo, useState, useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import type { Comment, TagRef } from "./CommentCard";
import CommentGroup from "./CommentGroup";

const DRAFT_ID = "__draft__";

const CARD_WIDTH = 320;
const CARD_MARGIN = 20;
const CAROUSEL_TAB_WIDTH = 20;

interface CommentSectionProps {
  duration: number;
  pxPerSec: number;
  onScroll: (left: number) => void;
  comments?: Comment[];
  onCommentDoubleClick?: (comment: Comment) => void;
  onGroupClick?: (comments: Comment[]) => void;
  focusedCommentId?: string | null;
  onFocusComment?: (id: string | null) => void;
  onActiveCommentsChange?: (activeIds: Set<string>) => void;
  onDraftSubmit?: (text: string) => void;
  onDraftCancel?: () => void;
  onAddTag?: (commentId: string, tag: TagRef) => void;
  onRemoveTag?: (commentId: string, tagName: string) => void;
  onAddReply?: (commentId: string, text: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onDeleteReply?: (commentId: string, replyId: string) => void;
  allCustomTags?: TagRef[];
  onTagContextMenu?: (tag: TagRef, comment: Comment, x: number, y: number) => void;
}

export interface CommentSectionHandle {
  setScrollLeft: (left: number) => void;
  getScrollLeft: () => number;
}

const CommentSection = forwardRef<CommentSectionHandle, CommentSectionProps>(
  ({ duration, pxPerSec, onScroll, comments = [], onCommentDoubleClick, onGroupClick, focusedCommentId, onFocusComment, onActiveCommentsChange, onDraftSubmit, onDraftCancel, onAddTag, onRemoveTag,  allCustomTags = [],
  onAddReply,
  onDeleteComment,
  onDeleteReply,
  onTagContextMenu,
}, ref) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const totalWidth = pxPerSec * duration;

    // Track which comment is "on top" in each group
    const [activeByGroup, setActiveByGroup] = useState<Map<string, string>>(new Map());

    const handleActiveCommentChange = useCallback((groupId: string, commentId: string) => {
      setActiveByGroup((prev) => {
        if (prev.get(groupId) === commentId) return prev;
        const next = new Map(prev);
        next.set(groupId, commentId);
        return next;
      });
    }, []);

    const activeCommentIds = useMemo(
      () => new Set(activeByGroup.values()),
      [activeByGroup]
    );

    useEffect(() => {
      onActiveCommentsChange?.(activeCommentIds);
    }, [activeCommentIds, onActiveCommentsChange]);

    useImperativeHandle(ref, () => ({
      setScrollLeft: (left: number) => {
        if (scrollRef.current) scrollRef.current.scrollLeft = left;
      },
      getScrollLeft: () => scrollRef.current?.scrollLeft || 0,
    }));

    const groups = useMemo(() => {
      if (duration <= 0 || totalWidth <= 0) return [];

      // Separate drafts from regular comments — drafts never group
      const draftComments = comments.filter(c => c.id === DRAFT_ID);
      const regularComments = comments.filter(c => c.id !== DRAFT_ID);

      const sorted = [...regularComments]
        .map((c) => {
          const mid = c.endTimestamp != null
            ? (c.timestamp + c.endTimestamp) / 2
            : c.timestamp;
          return { pct: mid / duration, comment: c };
        })
        .sort((a, b) => a.pct - b.pct);

      const clustered: { id: string; xPct: number; comments: Comment[] }[] = [];
      let lastRightEdge = -Infinity;

      const clampX = (x: number, isCarousel: boolean) => {
        const extra = isCarousel ? CAROUSEL_TAB_WIDTH : 0;
        return Math.max(
          CARD_WIDTH / 2 + CARD_MARGIN + extra,
          Math.min(totalWidth - CARD_WIDTH / 2 - CARD_MARGIN - extra, x),
        );
      };

      // Ghost cards in a carousel peek this many px beyond the card edge (must match CommentGroup SLOT_X)
      const GHOST_PEEK = 40;

      sorted.forEach((p) => {
        const x = clampX(p.pct * totalWidth, false);
        // True left edge of this card (no ghost — this card isn't a carousel yet)
        const cardLeft = x - CARD_WIDTH / 2;
        // True right edge
        const cardRight = x + CARD_WIDTH / 2;

        if (cardLeft >= lastRightEdge) {
          // Cards don't overlap at all — start a new group
          clustered.push({ id: p.comment.id, xPct: (x / totalWidth) * 100, comments: [p.comment] });
          // Reserve space for our right ghost so the next card doesn't clip into it
          lastRightEdge = cardRight + GHOST_PEEK;
        } else {
          if (clustered.length > 0) {
            const last = clustered[clustered.length - 1];
            last.comments.push(p.comment);
            const groupX = clampX((last.xPct / 100) * totalWidth, true);
            last.xPct = (groupX / totalWidth) * 100;
            lastRightEdge = groupX + CARD_WIDTH / 2 + GHOST_PEEK;
          } else {
            clustered.push({ id: p.comment.id, xPct: (x / totalWidth) * 100, comments: [p.comment] });
            lastRightEdge = cardRight + GHOST_PEEK;
          }
        }
      });

      // Add draft comments as standalone ungrouped entries
      for (const draft of draftComments) {
        const x = clampX((draft.timestamp / duration) * totalWidth, false);
        clustered.push({ id: draft.id, xPct: (x / totalWidth) * 100, comments: [draft] });
      }

      return clustered;
    }, [comments, duration, totalWidth]);

    useEffect(() => {
      setActiveByGroup((prev) => {
        const currentGroupIds = new Set(groups.map((g) => g.id));
        let changed = false;
        const next = new Map(prev);

        for (const g of groups) {
          if (!next.has(g.id)) {
            next.set(g.id, g.comments[0].id);
            changed = true;
          }
        }

        for (const groupId of prev.keys()) {
          if (!currentGroupIds.has(groupId)) {
            next.delete(groupId);
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, [groups]);

    return (
      <div className="comment-section">
        <div
          ref={scrollRef}
          onScroll={() => onScroll(scrollRef.current?.scrollLeft || 0)}
          onClick={() => onFocusComment?.(null)}
          className="comment-section__scroll"
        >
          <div className="comment-section__track" style={{ width: totalWidth, minWidth: "100%" }}>
            {groups.map((group) => (
              <CommentGroup
                key={group.id}
                comments={group.comments}
                xPct={group.xPct}
                isFocused={group.comments.some(c => c.id === focusedCommentId)}
                onFocus={(id) => onFocusComment?.(id)}
                onCommentDoubleClick={onCommentDoubleClick}
                onGroupExpand={onGroupClick}
                onActiveCommentChange={handleActiveCommentChange}
                onDraftSubmit={onDraftSubmit}
                onDraftCancel={onDraftCancel}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
              onAddReply={onAddReply}
              onDeleteComment={onDeleteComment}
              onDeleteReply={onDeleteReply}
              allCustomTags={allCustomTags}
              onTagContextMenu={onTagContextMenu}
            />
            ))}
          </div>
        </div>
      </div>
    );
  }
);

export default CommentSection;
