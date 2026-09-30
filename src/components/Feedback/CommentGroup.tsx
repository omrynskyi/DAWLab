import { memo, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Comment, TagRef } from "./CommentCard";
import CommentCard from "./CommentCard";

const DRAFT_ID = "__draft__";

interface CommentGroupProps {
  comments: Comment[];
  xPct: number;
  isFocused?: boolean;
  onFocus?: (id: string | null) => void;
  onCommentDoubleClick?: (comment: Comment) => void;
  onGroupExpand?: (comments: Comment[]) => void;
  onActiveCommentChange?: (groupId: string, commentId: string) => void;
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

// Horizontal distance between slot centers. The center card (320px wide) covers
// ±160px. With SLOT_X=72, the side card's inner edge sits at 72-144=−72px —
// fully behind the center — and its outer edge at 72+144=216px, giving ~56px peek.
const SLOT_X = 40;
const PEEK_SCALE = 0.9;
const PEEK_OPACITY = 0.5;

// Exit variant receives AnimatePresence's `custom` (direction).
const cardVariants = {
  exit: (dir: number) => ({
    x: dir > 0 ? -(SLOT_X * 3) : SLOT_X * 3,
    opacity: 0,
    scale: PEEK_SCALE,
  }),
};

const SPRING = { type: "spring" as const, stiffness: 320, damping: 32, mass: 0.9 };

const CommentGroup = memo(function CommentGroup({
  comments, xPct, isFocused, onFocus, onCommentDoubleClick, onGroupExpand, onActiveCommentChange, onDraftSubmit, onDraftCancel,  onAddTag,  onRemoveTag,
  onAddReply,
  onDeleteComment,
  onDeleteReply,
  allCustomTags = [],
  onTagContextMenu,
}: CommentGroupProps) {
  const [[currentIndex, direction], setSlide] = useState<[number, number]>([0, 1]);
  const count = comments.length;

  // Clamp index if the comments array shrinks (e.g. after a group expand re-render)
  const safeIndex = Math.min(currentIndex, Math.max(0, count - 1));
  const currentComment = comments[safeIndex];

  // Keep index in sync with the clamped value
  useEffect(() => {
    if (safeIndex !== currentIndex) setSlide([safeIndex, 0]);
  }, [safeIndex, currentIndex]);

  useEffect(() => {
    if (!comments[0] || !currentComment) return;
    onActiveCommentChange?.(comments[0].id, currentComment.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as on the website: fire on trigger change only
  }, [currentComment?.id, onActiveCommentChange, comments]);

  // Delay single-click navigation so a fast second click can be detected as
  // a double-click (which expands the group) before navigation fires.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSlot = useRef(0);

  const handleSideClick = (e: React.MouseEvent, slot: number) => {
    e.stopPropagation();
    if (clickTimer.current !== null) {
      // Second click within window → double-click, expand instead of navigate
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onGroupExpand?.(comments);
      return;
    }
    pendingSlot.current = slot;
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      if (pendingSlot.current < 0 && safeIndex > 0) setSlide(([p]) => [p - 1, -1]);
      else if (pendingSlot.current > 0 && safeIndex < count - 1) setSlide(([p]) => [p + 1, 1]);
    }, 220);
  };

  if (!currentComment) return null;

  // Slots −1 (prev), 0 (active), +1 (next) — only what exists
  const visibleSlots = ([-1, 0, 1] as const)
    .map((s) => ({ slot: s, index: safeIndex + s }))
    .filter(({ index }) => index >= 0 && index < count);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: `${xPct}%`,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        zIndex: isFocused ? 100 : 10,
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onFocus?.(isFocused ? null : currentComment.id);
        }}
        style={{ position: "relative" }}
      >
        {/*
          Invisible spacer: keeps the wrapper the same height as the active card
          so the surrounding layout (e.g. centering) never jumps.
        */}
        <div style={{ visibility: "hidden", pointerEvents: "none" }}>
          <CommentCard comment={currentComment} isTimeline />
        </div>

        {/* All three slots rendered simultaneously and animated between positions */}
        <AnimatePresence initial={false} custom={direction}>
          {visibleSlots.map(({ slot, index }) => (
            <motion.div
              key={index}
              custom={direction}
              variants={cardVariants}
              initial={{
                x: direction > 0 ? SLOT_X * 3 : -SLOT_X * 3,
                scale: PEEK_SCALE,
                opacity: 0,
                height: "90%",
              }}
              animate={{
                x: slot * SLOT_X,
                scale: slot === 0 ? 1 : PEEK_SCALE,
                opacity: slot === 0 ? 1 : PEEK_OPACITY,
                height: slot === 0 ? "100%" : "90%",
              }}
              exit="exit"
              transition={SPRING}
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                y: "-50%",
                zIndex: slot === 0 ? 10 : 5,
                cursor: slot !== 0 ? "pointer" : "default",
                width: "100%",
              }}
              onClick={slot !== 0 ? (e) => handleSideClick(e, slot) : undefined}
            >
              <CommentCard
                comment={comments[index]}
                isGhost={slot !== 0}
                isTimeline
                isEditing={comments[index].id === DRAFT_ID && slot === 0}
                onSubmit={onDraftSubmit}
                onCancel={onDraftCancel}
                onExpandGroup={count > 1 && slot === 0 ? () => onGroupExpand?.(comments) : undefined}
                onDoubleClick={
                  slot === 0
                    ? () => onCommentDoubleClick?.(comments[index])
                    : () => onGroupExpand?.(comments)
                }
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
                onAddReply={onAddReply}
                onDeleteComment={onDeleteComment}
                onDeleteReply={onDeleteReply}
                allCustomTags={allCustomTags}
                onTagContextMenu={onTagContextMenu}
              />
            </motion.div>
          ))}
        </AnimatePresence>

      </motion.div>
    </div>
  );
});

export default CommentGroup;
