import { memo, useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Minus } from "lucide-react";
import { getFeedbackPortalRoot } from "./portalRoot";

// ── Tag color system ──
export const TAG_COLORS = [
  { bg: "rgba(74, 222, 128, 0.15)", text: "#4ade80" },
  { bg: "rgba(248, 113, 113, 0.15)", text: "#f87171" },
  { bg: "rgba(126, 170, 238, 0.15)", text: "#7eaaee" },
  { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24" },
  { bg: "rgba(192, 132, 252, 0.15)", text: "#c084fc" },
];

export interface TagRef {
  name: string;
  colorIndex: number; // 0-4
}

export const PRESET_TAGS: TagRef[] = [
  { name: "Done", colorIndex: 0 },
  { name: "Archived", colorIndex: 1 },
  { name: "Working", colorIndex: 2 },
];

export interface Reply {
  id: string;
  username: string;
  comment: string;
  timestamp: number; // seconds
  avatarUrl?: string | null;
  authorColor?: string;
}

export interface Comment {
  id: string;
  username: string;
  comment: string;
  timestamp: number; // seconds
  endTimestamp?: number; // optional end time in seconds
  avatarUrl?: string | null;
  authorColor?: string;
  tags?: TagRef[];
  replies?: Reply[];
}

interface CommentCardProps {
  comment: Comment;
  onDoubleClick?: () => void;
  isGhost?: boolean;
  isEditing?: boolean;
  isTimeline?: boolean;
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
  onExpandGroup?: () => void;
  onAddReply?: (commentId: string, text: string) => void;
  onAddTag?: (commentId: string, tag: TagRef) => void;
  onRemoveTag?: (commentId: string, tagName: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onDeleteReply?: (commentId: string, replyId: string) => void;
  allCustomTags?: TagRef[];
  onTagContextMenu?: (tag: TagRef, comment: Comment, x: number, y: number) => void;
}

function formatTimestamp(seconds: number) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

export function getAuthorGradient(): string {
  return "linear-gradient(135deg, #0094ff 0%, #0056cc 100%)";
}

const SPRING = { type: "spring" as const, stiffness: 500, damping: 32, mass: 0.8 };

const CommentCard = memo(function CommentCard({
  comment, onDoubleClick, isGhost, isEditing, isTimeline, onSubmit, onCancel, onExpandGroup,
  onAddReply,
  onAddTag, onRemoveTag, allCustomTags = [],
  onDeleteComment,
  onDeleteReply,
  onTagContextMenu,
}: CommentCardProps) {
  const gradient = getAuthorGradient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const [popoverRect, setPopoverRect] = useState<{ bottom: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Context menus state
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [replyMenu, setReplyMenu] = useState<{ id: string; top: number; right: number } | null>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isTagsExpanded && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isTagsExpanded]);

  useEffect(() => {
    if (!isTagsExpanded) {
      setSearchValue("");
      setShowColorPicker(false);
      setSelectedColorIndex(0);
      setPopoverRect(null);
    } else if (isTimeline && wrapperRef.current) {
      // Fixed position: bottom of popover aligns with top of wrapper
      const rect = wrapperRef.current.getBoundingClientRect();
      setPopoverRect({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
    }
  }, [isTagsExpanded, isTimeline]);

  // Dismiss on Escape / scroll when open in timeline mode
  useEffect(() => {
    if (!isTagsExpanded || !isTimeline) return;
    const dismiss = () => setIsTagsExpanded(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("wheel", dismiss, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("wheel", dismiss);
    };
  }, [isTagsExpanded, isTimeline]);

  // Detect if scroll is needed for fade indicator
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { setCanScroll(false); return; }
    setCanScroll(el.scrollWidth > el.clientWidth + 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkScroll, comment.tags]);

  useEffect(() => {
    if (isReplying && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [isReplying]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = e.currentTarget.value.trim();
      if (text) {
        onSubmit?.(text);
      } else {
        onCancel?.();
      }
    }
    if (e.key === "Escape") {
      onCancel?.();
    }
    if (e.key === "Backspace" && e.currentTarget.value === "") {
      e.preventDefault();
      onCancel?.();
    }
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const text = e.currentTarget.value.trim();
      if (text && onAddReply) {
        onAddReply(comment.id, text);
        setIsReplying(false);
      } else {
        setIsReplying(false);
      }
    }
    if (e.key === "Escape") {
      setIsReplying(false);
    }
  };

  const handleTagSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const name = searchValue.trim();
      if (!name) return;
      onAddTag?.(comment.id, { name, colorIndex: selectedColorIndex });
      setSearchValue("");
      setShowColorPicker(false);
    }
    if (e.key === "Escape") {
      setIsTagsExpanded(false);
    }
  };

  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = searchValue.trim();
    if (!name) return;
    onAddTag?.(comment.id, { name, colorIndex: selectedColorIndex });
    setSearchValue("");
    setShowColorPicker(false);
  };

  const handleTagsBarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTagsExpanded(prev => !prev);
  };

  const handleAddPresetTag = (tag: TagRef, e: React.MouseEvent) => {
    e.stopPropagation();
    const existing = (comment.tags || []).find(t => t.name === tag.name);
    if (existing) {
      onRemoveTag?.(comment.id, tag.name);
    } else {
      onAddTag?.(comment.id, tag);
    }
  };

  const handlePreviewTagClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowColorPicker(prev => !prev);
  };

  const handleResolve = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (onAddTag) {
      onAddTag(comment.id, PRESET_TAGS[0]); // PRESET_TAGS[0] is "Done"
    }
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (onAddTag) {
      onAddTag(comment.id, PRESET_TAGS[1]); // PRESET_TAGS[1] is "Archived"
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (onDeleteComment) {
      onDeleteComment(comment.id);
    }
  };

  const handleDeleteReplyClick = (e: React.MouseEvent, replyId: string) => {
    e.stopPropagation();
    setReplyMenu(null);
    if (onDeleteReply) {
      onDeleteReply(comment.id, replyId);
    }
  };

  const isResolved = comment.tags?.some(tag => tag.name === "Done");

  const timeDisplay = comment.endTimestamp != null
    ? `${formatTimestamp(comment.timestamp)} - ${formatTimestamp(comment.endTimestamp)}`
    : formatTimestamp(comment.timestamp);

  const commentTags = comment.tags || [];

  const existingTagNames = new Set(commentTags.map(t => t.name));
  const availablePresets = PRESET_TAGS.filter(t => !existingTagNames.has(t.name));
  const availableCustom = allCustomTags.filter(t => !existingTagNames.has(t.name) && !PRESET_TAGS.some(p => p.name === t.name));

  const searchLower = searchValue.toLowerCase().trim();
  const filteredPresets = searchLower ? availablePresets.filter(t => t.name.toLowerCase().includes(searchLower)) : availablePresets;
  const filteredCustom = searchLower ? availableCustom.filter(t => t.name.toLowerCase().includes(searchLower)) : availableCustom;
  const hasExactMatch = [...PRESET_TAGS, ...allCustomTags].some(t => t.name.toLowerCase() === searchLower);
  const showCreatePreview = searchLower.length > 0 && !hasExactMatch;

  return (
    <div
      className={`comment-card${isTimeline ? " comment-card--timeline" : ""}`}
      onDoubleClick={onDoubleClick}
      style={{
        cursor: "pointer",
        overflow: "visible",
        height: "100%",
        ["--author-gradient" as string]: gradient,
      }}
    >
      <motion.div
        initial={false}
        animate={{ opacity: isGhost ? 0 : 1 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="comment-card__inner"
        onContextMenu={(e) => {
          if (!isEditing) {
            e.preventDefault();
            e.stopPropagation();
            setIsMenuOpen(true);
          }
        }}
      >
        {/* ── Unified dark wrapper: tags-bar + picker ── */}
        <div
          ref={wrapperRef}
          className={`comment-card__tags-wrapper${isTagsExpanded ? " comment-card__tags-wrapper--expanded" : ""}`}
          onClick={handleTagsBarClick}
        >
          {/* Tag row: author + tags, h-scroll with fade + dismiss minus */}
          <div className="comment-card__tags-row-wrap">
            <div className={`comment-card__tags-row${canScroll ? " comment-card__tags-row--scrollable" : ""}`}>
              <div className="comment-card__tags-scroll" ref={scrollRef}>
                <span
                  className="comment-card__tag-pill comment-card__tag-pill--author"
                  style={comment.authorColor ? {
                    background: comment.authorColor + "26",
                    color: comment.authorColor,
                    border: "none",
                  } : undefined}
                >
                  {comment.username}
                </span>
                {commentTags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="comment-card__tag-pill"
                    style={{
                      background: TAG_COLORS[tag.colorIndex]?.bg,
                      color: TAG_COLORS[tag.colorIndex]?.text,
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTagContextMenu?.(tag, comment, e.clientX, e.clientY);
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
            {/* Minus dismiss — only shown when expanded */}
            {isTagsExpanded && (
              <div
                className="tag-dismiss-btn"
                onClick={handleTagsBarClick}
              >
                <Minus size={14} />
              </div>
            )}
          </div>

          {/* Tag picker — portal above card in timeline, inline in sidebar */}
          {isTimeline ? (
            popoverRect && createPortal(
              <AnimatePresence>
                {isTagsExpanded && (
                  <motion.div
                    className="tag-picker tag-picker--popover"
                    style={{
                      position: "fixed",
                      bottom: popoverRect.bottom,
                      left: popoverRect.left,
                    }}
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.97 }}
                    transition={SPRING}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                  <div className="tag-picker__content">
                    {commentTags.length > 0 && (
                      <div className="tag-picker__current">
                        {commentTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="tag-pill tag-pill--removable"
                            style={{
                              background: TAG_COLORS[tag.colorIndex]?.bg,
                              color: TAG_COLORS[tag.colorIndex]?.text,
                            }}
                            onClick={(e) => { e.stopPropagation(); onRemoveTag?.(comment.id, tag.name); }}
                          >
                            {tag.name} ×
                          </span>
                        ))}
                      </div>
                    )}
                    {filteredPresets.length > 0 && (
                      <>
                        <span className="tag-picker__label">CLICK TO ADD TAG</span>
                        <div className="tag-picker__grid">
                          {filteredPresets.map((tag) => (
                            <span
                              key={tag.name}
                              className="tag-pill tag-pill--selectable"
                              style={{
                                background: TAG_COLORS[tag.colorIndex]?.bg,
                                color: TAG_COLORS[tag.colorIndex]?.text,
                              }}
                              onClick={(e) => handleAddPresetTag(tag, e)}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {filteredCustom.length > 0 && (
                      <>
                        <span className="tag-picker__label">CUSTOM</span>
                        <div className="tag-picker__grid">
                          {filteredCustom.map((tag) => (
                            <span
                              key={tag.name}
                              className="tag-pill tag-pill--selectable"
                              style={{
                                background: TAG_COLORS[tag.colorIndex]?.bg,
                                color: TAG_COLORS[tag.colorIndex]?.text,
                              }}
                              onClick={(e) => handleAddPresetTag(tag, e)}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {showCreatePreview && (
                      <div className="tag-picker__create">
                        <span
                          className="tag-pill tag-pill--preview"
                          style={{
                            background: TAG_COLORS[selectedColorIndex]?.bg,
                            color: TAG_COLORS[selectedColorIndex]?.text,
                          }}
                          onClick={handlePreviewTagClick}
                        >
                          {searchValue.trim()}
                        </span>
                        <AnimatePresence>
                          {showColorPicker && (
                            <motion.div
                              className="tag-picker__colors"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={SPRING}
                            >
                              {TAG_COLORS.map((c, i) => (
                                <div
                                  key={i}
                                  className={`tag-color-swatch${i === selectedColorIndex ? " tag-color-swatch--active" : ""}`}
                                  style={{ background: c.text }}
                                  onClick={(e) => { e.stopPropagation(); setSelectedColorIndex(i); }}
                                />
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    <div className="tag-picker__search-row">
                      <input
                        ref={searchInputRef}
                        className="tag-picker__input"
                        type="text"
                        placeholder="Search or create a new tag"
                        value={searchValue}
                        onChange={(e) => { setSearchValue(e.target.value); setShowColorPicker(false); }}
                        onKeyDown={handleTagSearchKeyDown}
                      />
                      <div className="tag-picker__search-plus" onClick={handlePlusClick}>
                        <Plus size={14} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>,
            getFeedbackPortalRoot()
            )
          ) : (
            /* Two synchronized springs: container height 0→auto, content translateY -100%→0.
               Same spring = content bottom always tracks container bottom = zero lag. */
            <motion.div
              initial={{ height: 0, overflow: "hidden" }}
              animate={{ height: isTagsExpanded ? "auto" : 0, overflow: "hidden" }}
              transition={SPRING}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <motion.div
                initial={{ y: "-100%" }}
                animate={{ y: isTagsExpanded ? "0%" : "-100%" }}
                transition={SPRING}
              >
                <div className="tag-picker__content">
                  {commentTags.length > 0 && (
                    <div className="tag-picker__current">
                      {commentTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="tag-pill tag-pill--removable"
                          style={{
                            background: TAG_COLORS[tag.colorIndex]?.bg,
                            color: TAG_COLORS[tag.colorIndex]?.text,
                          }}
                          onClick={(e) => { e.stopPropagation(); onRemoveTag?.(comment.id, tag.name); }}
                        >
                          {tag.name} ×
                        </span>
                      ))}
                    </div>
                  )}
                  {filteredPresets.length > 0 && (
                    <>
                      <span className="tag-picker__label">CLICK TO ADD TAG</span>
                      <div className="tag-picker__grid">
                        {filteredPresets.map((tag) => (
                          <span
                            key={tag.name}
                            className="tag-pill tag-pill--selectable"
                            style={{
                              background: TAG_COLORS[tag.colorIndex]?.bg,
                              color: TAG_COLORS[tag.colorIndex]?.text,
                            }}
                            onClick={(e) => handleAddPresetTag(tag, e)}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {filteredCustom.length > 0 && (
                    <>
                      <span className="tag-picker__label">CUSTOM</span>
                      <div className="tag-picker__grid">
                        {filteredCustom.map((tag) => (
                          <span
                            key={tag.name}
                            className="tag-pill tag-pill--selectable"
                            style={{
                              background: TAG_COLORS[tag.colorIndex]?.bg,
                              color: TAG_COLORS[tag.colorIndex]?.text,
                            }}
                            onClick={(e) => handleAddPresetTag(tag, e)}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {showCreatePreview && (
                    <div className="tag-picker__create">
                      <span
                        className="tag-pill tag-pill--preview"
                        style={{
                          background: TAG_COLORS[selectedColorIndex]?.bg,
                          color: TAG_COLORS[selectedColorIndex]?.text,
                        }}
                        onClick={handlePreviewTagClick}
                      >
                        {searchValue.trim()}
                      </span>
                      <AnimatePresence>
                        {showColorPicker && (
                          <motion.div
                            className="tag-picker__colors"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={SPRING}
                          >
                            {TAG_COLORS.map((c, i) => (
                              <div
                                key={i}
                                className={`tag-color-swatch${i === selectedColorIndex ? " tag-color-swatch--active" : ""}`}
                                style={{ background: c.text }}
                                onClick={(e) => { e.stopPropagation(); setSelectedColorIndex(i); }}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  <div className="tag-picker__search-row">
                    <input
                      ref={searchInputRef}
                      className="tag-picker__input"
                      type="text"
                      placeholder="Search or create a new tag"
                      value={searchValue}
                      onChange={(e) => { setSearchValue(e.target.value); setShowColorPicker(false); }}
                      onKeyDown={handleTagSearchKeyDown}
                    />
                    <div className="tag-picker__search-plus" onClick={handlePlusClick}>
                      <Plus size={14} />
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </div>

        {/* ── Message text ── */}
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="comment-card__textarea"
            defaultValue={comment.comment}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setTimeout(() => {
                const text = textareaRef.current?.value.trim();
                if (!text) onCancel?.();
              }, 150);
            }}
            placeholder="Type a comment..."
          />
        ) : (
          <p className="comment-card__text">{comment.comment}</p>
        )}

        {/* ── Timestamp (below message) ── */}
        {!isEditing && (
          <span className="comment-card__time-label">{timeDisplay}</span>
        )}

        {/* ── Replies ── */}
        {!isEditing && comment.replies && comment.replies.length > 0 && (
          <div className="comment-card__replies">
            {comment.replies.map((reply) => (
              <div key={reply.id} className="comment-card__reply">
                <div className="comment-card__reply-content">
                  <span className="comment-card__reply-author">{reply.username}</span>
                  <span className="comment-card__reply-text">{reply.comment}</span>
                </div>
                <div>
                  <button
                    className="sidebar-comment__action"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (replyMenu?.id === reply.id) {
                        setReplyMenu(null);
                      } else {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setReplyMenu({ id: reply.id, top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="1"/>
                      <circle cx="12" cy="5" r="1"/>
                      <circle cx="12" cy="19" r="1"/>
                    </svg>
                  </button>
                  {replyMenu?.id === reply.id && createPortal(
                    <AnimatePresence>
                      <>
                        <div
                          style={{ position: "fixed", inset: 0, zIndex: 999 }}
                          onClick={(e) => { e.stopPropagation(); setReplyMenu(null); }}
                        />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.1 }}
                          className="context-menu"
                          style={{ position: "fixed", top: replyMenu.top, right: replyMenu.right, zIndex: 1000 }}
                        >
                          <div
                            className="context-menu__item context-menu__item--danger"
                            onClick={(e) => handleDeleteReplyClick(e, reply.id)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                            </svg>
                            Delete Reply
                          </div>
                        </motion.div>
                      </>
                    </AnimatePresence>,
                    getFeedbackPortalRoot()
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Reply Input ── */}
        {isReplying && !isEditing && (
          <div className="comment-card__reply-input-wrap">
            <input
              ref={replyInputRef}
              type="text"
              className="comment-card__reply-input"
              placeholder="Write a reply..."
              onKeyDown={handleReplyKeyDown}
              onBlur={() => setIsReplying(false)}
            />
          </div>
        )}

        {/* ── Footer: reply, expand group, dots ── */}
        {!isEditing && (
          <div className="comment-card__footer">
            <div
              className="comment-card__action"
              onClick={(e) => { e.stopPropagation(); setIsReplying(true); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 17 4 12 9 7" />
                <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
              </svg>
            </div>
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              {onExpandGroup && (
                <button
                  className="comment-card__expand-btn"
                  onClick={(e) => { e.stopPropagation(); onExpandGroup(); }}
                >
                  Expand Group
                </button>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <button
                className="comment-card__control-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                title="More actions"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>

              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 999 }}
                      onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      className="context-menu"
                      style={{ bottom: "100%", right: 0, marginBottom: "8px" }}
                    >
                      {!isResolved && (
                        <div
                          className="context-menu__item context-menu__item--success"
                          onClick={handleResolve}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          Resolve
                        </div>
                      )}
                      <div
                        className="context-menu__item context-menu__item--danger"
                        onClick={handleArchiveClick}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="5" />
                          <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
                          <path d="M10 13h4" />
                        </svg>
                        Archive
                      </div>
                      {onDeleteComment && (
                        <div
                          className="context-menu__item context-menu__item--danger"
                          onClick={handleDeleteClick}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                          Delete
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
});

export default CommentCard;
