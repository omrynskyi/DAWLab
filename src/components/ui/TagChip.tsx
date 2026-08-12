import React, { useRef, useState, useEffect } from 'react';
import './TagChip.css';

interface TagChipProps {
  tag: string;
  color?: string; // Now accepts any hex color
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
 * Get a lighter/darker variant of a hex color for text
 */
const getTextColor = (bgColor: string): string => {
  // Default to blue if no color provided
  if (!bgColor || bgColor === '#007bff') return '#7cc4ff';
  
  // Parse hex color
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Lighten the color for text
  const lighten = (c: number) => Math.min(255, c + 100);
  return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
};

/**
 * TagChip component that displays a tag with optional remove button.
 * Long text scrolls with marquee animation on hover only if it overflows.
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
  const textRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Normalize tag to Title Case
  const displayTag = toTitleCase(tag);

  useEffect(() => {
    const checkOverflow = () => {
      if (textRef.current && containerRef.current) {
        const textWidth = textRef.current.scrollWidth;
        const containerWidth = containerRef.current.clientWidth;
        setIsOverflowing(textWidth > containerWidth);
      }
    };
    
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [tag]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e);
    }
  };

  // Dynamic styles based on color
  const chipStyle: React.CSSProperties = {
    background: active ? `${color}66` : `${color}33`,
    borderColor: active ? color : `${color}99`,
    color: active ? '#fff' : getTextColor(color),
  };

  return (
    <div
      className={`tag-chip ${active ? 'tag-chip-active' : ''} ${onClick ? 'tag-chip-clickable' : ''} ${isOverflowing ? 'tag-chip-overflowing' : ''}`}
      style={chipStyle}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      <div className="tag-chip-content" ref={containerRef}>
        <span className="tag-chip-text" ref={textRef}>{displayTag}</span>
      </div>
      {removable && onRemove && (
        <button
          className="tag-chip-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${displayTag}`}
        >
          ×
        </button>
      )}
    </div>
  );
};
