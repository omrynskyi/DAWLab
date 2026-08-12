import React, { useRef, useEffect } from 'react';
import { TagChip } from '@/components/ui/TagChip';
import { TagInput } from '@/components/ui/TagInput';
import { X } from 'lucide-react';
import './TagManagerPopover.css';

interface TagManagerPopoverProps {
  x: number;
  y: number;
  tags: string[];
  tagColors: Record<string, string>;
  onAddTag: (tag: string, color: string) => void;
  onRemoveTag: (tag: string) => void;
  onClose: () => void;
}

export const TagManagerPopover: React.FC<TagManagerPopoverProps> = ({
  x,
  y,
  tags,
  tagColors,
  onAddTag,
  onRemoveTag,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the right-click that opened this from immediately closing it
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Clamp position to viewport
  const POPOVER_WIDTH = 260;
  const POPOVER_HEIGHT = 220; // approximate
  const left = Math.min(x, window.innerWidth - POPOVER_WIDTH - 12);
  const top = Math.min(y, window.innerHeight - POPOVER_HEIGHT - 12);

  return (
    <div
      ref={ref}
      className="tag-manager-popover"
      style={{ left, top }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="tmp-header">
        <span className="tmp-title">Tags</span>
        <button className="tmp-close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="tmp-body">
        {tags.length === 0 ? (
          <span className="tmp-empty">No tags yet</span>
        ) : (
          <div className="tmp-tags">
            {tags.map(tag => (
              <TagChip
                key={tag}
                tag={tag}
                color={tagColors[tag]}
                removable
                onRemove={() => onRemoveTag(tag)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="tmp-footer">
        <TagInput
          onAddTag={(tag, color) => onAddTag(tag, color)}
          placeholder="Add tag..."
          disabled={false}
        />
      </div>
    </div>
  );
};
