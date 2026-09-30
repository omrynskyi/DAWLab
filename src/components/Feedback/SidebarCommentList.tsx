import { useMemo, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import CommentCard, { getAuthorGradient } from "./CommentCard";
import type { Comment, TagRef } from "./CommentCard";

interface SidebarCommentListProps {
  comments: Comment[];
  focusedCommentId?: string | null;
  currentTime?: number;
  draftTriggerKey?: number;
  selectedRange?: { start: number; end: number } | null;
  onCommentClick?: (comment: Comment) => void;
  onCommentDoubleClick?: (comment: Comment) => void;
  onDeselect?: () => void;
  onAddTag?: (commentId: string, tag: TagRef) => void;
  onRemoveTag?: (commentId: string, tagName: string) => void;
  onAddReply?: (commentId: string, text: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onDeleteReply?: (commentId: string, replyId: string) => void;
  allCustomTags?: TagRef[];
  onDraftSubmit?: (text: string, timestamp: number, endTimestamp: number) => void;
  onDraftCancel?: () => void;
  onTagContextMenu?: (tag: TagRef, comment: Comment, x: number, y: number) => void;
}

const DRAFT_ID = "__draft__";

function formatTimestamp(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

const COMMENT_DURATION = 5;

// Card grows upward — bottom edge stays fixed in the sidebar.
// pills-container uses flex:1 so it's 0px when collapsed (no pills visible)
// and expands to fill the extra space when the card height grows.
// Collapsed: padding(18) + input-row(38) + padding(18) = 74
// Expanded:  padding(18) + pills(32) + gap(12) + input-row(38) + padding(18) = 118
const COLLAPSED_HEIGHT = 74;
const EXPANDED_HEIGHT = 118;

export default function SidebarCommentList({
  comments,
  focusedCommentId,
  currentTime = 0,
  draftTriggerKey,
  selectedRange,
  onCommentClick,
  onCommentDoubleClick,
  onDeselect,
  onAddTag,
  onRemoveTag,
  onAddReply,
  onDeleteComment,
  onDeleteReply,
  allCustomTags = [],
  onDraftSubmit,
  onDraftCancel,
  onTagContextMenu,
}: SidebarCommentListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentTime, setCommentTime] = useState(0);
  const [commentEndTime, setCommentEndTime] = useState(COMMENT_DURATION);
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  // Auto-scroll to active comment without over-scrolling
  useEffect(() => {
    if (!focusedCommentId) return;
    const el = itemRefs.current.get(focusedCommentId);
    const container = scrollRef.current;
    if (!el || !container) return;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (elTop < viewTop) {
      container.scrollTo({ top: elTop - 12, behavior: "smooth" });
    } else if (elBottom > viewBottom) {
      container.scrollTo({ top: elBottom - container.clientHeight + 12, behavior: "smooth" });
    }
  }, [focusedCommentId]);

  const sorted = useMemo(
    () => [...comments].filter(c => c.id !== DRAFT_ID).sort((a, b) => a.timestamp - b.timestamp),
    [comments]
  );

  const authorGradient = getAuthorGradient();
  const timeLabel = `${formatTimestamp(commentTime)} - ${formatTimestamp(commentEndTime)}`;

  const handleOpen = () => {
    if (!isExpanded) {
      if (selectedRange) {
        setCommentTime(selectedRange.start);
        setCommentEndTime(selectedRange.end);
      } else {
        setCommentTime(currentTime);
        setCommentEndTime(currentTime + COMMENT_DURATION);
      }
      setIsExpanded(true);
    }
  };

  // Auto-expand when a drag selection arrives from the waveform
  useEffect(() => {
    if (!selectedRange) return;
    handleOpen();
    setTimeout(() => textareaRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as on the website: fire on trigger change only
  }, [selectedRange]);

  // Expand and focus when triggered from toolbar or keyboard
  useEffect(() => {
    if (draftTriggerKey) {
      handleOpen();
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- as on the website: fire on trigger change only
  }, [draftTriggerKey]);

  const handleCancel = () => {
    setIsExpanded(false);
    setInputValue("");
    textareaRef.current?.blur();
    onDraftCancel?.();
  };

  const handleSubmit = () => {
    const text = inputValue.trim();
    if (text) {
      onDraftSubmit?.(text, commentTime, commentEndTime);
    }
    setInputValue("");
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
    if (e.key === "Backspace" && inputValue === "") {
      e.preventDefault();
      handleCancel();
    }
  };

  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isExpanded]);

  return (
    <div className="sidebar-comment-list" onClick={onDeselect}>
      <div className="sidebar-comment-list__scroll" ref={scrollRef}>
        {sorted.map((comment) => (
          <div
            key={comment.id}
            ref={(el) => { if (el) itemRefs.current.set(comment.id, el); else itemRefs.current.delete(comment.id); }}
            className={`sidebar-comment-item${comment.id === focusedCommentId ? " sidebar-comment-item--focused" : ""}`}
            onClick={(e) => { e.stopPropagation(); onCommentClick?.(comment); }}
            onDoubleClick={(e) => { e.stopPropagation(); onCommentDoubleClick?.(comment); }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              const now = Date.now();
              const last = lastTapRef.current;
              if (last && last.id === comment.id && now - last.time < 300) {
                lastTapRef.current = null;
                onCommentDoubleClick?.(comment);
              } else {
                lastTapRef.current = { id: comment.id, time: now };
              }
            }}
          >
            <CommentCard
              comment={comment}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              onAddReply={onAddReply}
              onDeleteComment={onDeleteComment}
              onDeleteReply={onDeleteReply}
              allCustomTags={allCustomTags}
              onTagContextMenu={onTagContextMenu}
            />
          </div>
        ))}
        <div className="sidebar-comment-list__bottom-spacer" />
      </div>

      <div className="sidebar-comment-list__fade" />

      <div className="sidebar-composer-wrap">
        <motion.div
          className="sidebar-composer"
          animate={{ height: isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT }}
          transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.8 }}
          onMouseDown={(e) => {
            // Clicking anywhere on the card that isn't the textarea itself:
            // prevent default so focus stays predictable, then manually focus.
            if (e.target !== textareaRef.current) {
              e.preventDefault();
              textareaRef.current?.focus();
            }
          }}
          style={{ ["--author-gradient" as string]: authorGradient }}
        >
          {/*
            pills-container uses flex:1 — it collapses to 0px when the card is
            74px tall (input-row fills all 38px of content area) and grows to
            44px when the card is 118px. overflow:hidden clips pills from the top
            as the container shrinks; they appear to slide up glued to the top.
          */}
          <div className="sidebar-composer__pills-container">
            <div className="sidebar-composer__pills-row">
              <span className="comment-card__tag-pill comment-card__tag-pill--author">
                You
              </span>
              <span className="comment-card__time-label">
                {timeLabel}
              </span>
            </div>
          </div>

          {/* Input row — always anchored at the bottom, never moves */}
          <div className="sidebar-composer__input-row">
            <textarea
              ref={textareaRef}
              className="sidebar-composer__textarea"
              placeholder="Type a Comment..."
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (!isExpanded) handleOpen();
              }}
              onKeyDown={handleKeyDown}
              onFocus={handleOpen}
              onBlur={() => {
                setTimeout(() => {
                  if (!inputValue.trim()) handleCancel();
                }, 150);
              }}
              rows={1}
            />

            <AnimatePresence>
              {isExpanded && (
                <motion.button
                  key="submit"
                  className="sidebar-composer__submit"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  onMouseDown={(e) => { e.preventDefault(); handleSubmit(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 10 4 15 9 20" />
                    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
