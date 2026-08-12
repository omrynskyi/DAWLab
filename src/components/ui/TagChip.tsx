import React from 'react';
import { X } from 'lucide-react';
import './TagChip.css';

interface TagChipProps {
  tag: string;
  color?: string; // Any hex color; drives the chip's accent (border / active fill)
  onRemove?: () => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  active?: boolean;
  removable?: boolean;
}

/**
 * Converts a string to Title Case (first letter of each word uppercase).
 */
export const toTitleCase = (str: string): string => {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * TagChip — a rectangular chip matching the library's facet-chip design system:
 * dark fill, the tag's color carried in the border, neutral text. Long labels
 * truncate with an ellipsis (full text on hover via title).
 */
export const TagChip: React.FC<TagChipProps> = ({
  tag,
  color = '#007bff',
  onRemove,
  onClick,
  onContextMenu,
  active = false,
  removable = false,
}) => {
  const displayTag = toTitleCase(tag);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e);
    }
  };

  return (
    <div
      className={`tag-chip${active ? ' tag-chip--active' : ''}${onClick ? ' tag-chip--clickable' : ''}${removable ? ' tag-chip--removable' : ''}`}
      style={{ ['--tag-color']: color } as React.CSSProperties}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      title={displayTag}
    >
      <span className="tag-chip-label">{displayTag}</span>
      {removable && onRemove && (
        <button
          className="tag-chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${displayTag}`}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
