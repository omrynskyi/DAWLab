import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { TagRef } from "./CommentCard";
import { TAG_COLORS } from "./CommentCard";

interface FilterPopoverProps {
  allTags: TagRef[];
  includeTags: string[];
  excludeTags: string[];
  onToggleInclude: (tagName: string) => void;
  onToggleExclude: (tagName: string) => void;
  onClear: () => void;
}

const SPRING = { type: "spring" as const, stiffness: 500, damping: 32, mass: 0.8 };

export default function FilterPopover({
  allTags, includeTags, excludeTags, onToggleInclude, onToggleExclude, onClear,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // "default" state is Archived excluded, nothing included — don't show Clear then
  const isDefault = includeTags.length === 0 && excludeTags.length === 1 && excludeTags[0] === "Archived";
  const activeCount = includeTags.length + excludeTags.length;

  return (
    <div ref={popoverRef} className="filter-popover-anchor">
      <div className="filter-chips-wrapper">
        <div className="filter-active-chips">
          <AnimatePresence initial={false}>
            {includeTags.map(name => {
              const tag = allTags.find(t => t.name === name);
              const colors = TAG_COLORS[tag?.colorIndex ?? 0];
              return (
                <motion.span
                  key={name}
                  className="filter-chip"
                  style={{ background: colors?.bg, color: colors?.text }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={SPRING}
                  onClick={() => onToggleInclude(name)}
                >
                  {name} <span className="filter-chip__remove">×</span>
                </motion.span>
              );
            })}
            {excludeTags.map(name => (
              <motion.span
                key={name}
                className="filter-chip filter-chip--excluded"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={SPRING}
                onClick={() => onToggleExclude(name)}
              >
                {name} <span className="filter-chip__remove">×</span>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <button
        ref={buttonRef}
        className={`transport-btn transport-btn--large${activeCount > 0 ? " transport-btn--on" : ""}`}
        title="Filter comments"
        onClick={() => {
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const POPOVER_WIDTH = 240;
            const MARGIN = 8;
            // Align right edge to button's right, clamped so popover stays on screen
            const left = Math.max(MARGIN, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - MARGIN));
            setPopoverPos({ top: rect.bottom + 8, left });
          }
          setOpen(prev => !prev);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="filter-popover"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={SPRING}
            style={popoverPos ? { position: "fixed", top: popoverPos.top, left: popoverPos.left, right: "auto" } : undefined}
          >
            <div className="filter-popover__header">
              <span className="filter-popover__title">Filter by tag</span>
              {!isDefault && activeCount > 0 && (
                <button className="filter-popover__clear" onClick={onClear}>
                  Clear
                </button>
              )}
            </div>

            {allTags.length === 0 && (
              <span className="filter-popover__empty">No tags yet</span>
            )}

            <div className="filter-popover__tags">
              {allTags.map((tag) => {
                const isIncluded = includeTags.includes(tag.name);
                const isExcluded = excludeTags.includes(tag.name);

                return (
                  <span
                    key={tag.name}
                    className={`tag-pill tag-pill--filter${isIncluded ? " tag-pill--included" : ""}${isExcluded ? " tag-pill--excluded" : ""}`}
                    style={{
                      background: isExcluded
                        ? "rgba(255,255,255,0.05)"
                        : TAG_COLORS[tag.colorIndex]?.bg,
                      color: isExcluded
                        ? "var(--text-muted)"
                        : TAG_COLORS[tag.colorIndex]?.text,
                      textDecoration: isExcluded ? "line-through" : "none",
                    }}
                    onClick={() => onToggleInclude(tag.name)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onToggleExclude(tag.name);
                    }}
                  >
                    {tag.name}
                  </span>
                );
              })}
            </div>

            <span className="filter-popover__hint">
              Click = include · Right-click = exclude
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
