import React, { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { toTitleCase, TagChip } from './TagChip';
import { ColorPalette } from './ColorPalette';
import type { TagSuggestion } from '@/lib/tags';
import './TagInput.css';

interface TagInputProps {
  onAddTag: (tag: string, color: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  defaultColor?: string;
  /** Tags the user can pick from (existing tags + defaults), with their colors. */
  suggestions?: TagSuggestion[];
  /** Tags already applied to the target — excluded from the suggestion list. */
  appliedTags?: string[];
}

/**
 * TagInput — a single integrated field for creating a tag. The color swatch,
 * text input and add action live inside one chip-styled container that adopts
 * the selected tag color on focus. A dropdown lets the user pick from existing
 * tags and defaults, or create a brand-new one.
 */
export const TagInput: React.FC<TagInputProps> = ({
  onAddTag,
  maxLength = 30,
  placeholder = 'Add tag...',
  disabled = false,
  defaultColor = '#007bff',
  suggestions = [],
  appliedTags = [],
}) => {
  const [value, setValue] = useState('');
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [showPalette, setShowPalette] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = value.trim().toLowerCase();

  // Suggestions minus anything already on the project, filtered by the query.
  const filtered = useMemo(() => {
    const applied = new Set(appliedTags.map(t => t.toLowerCase()));
    return suggestions.filter(
      s => !applied.has(s.name.toLowerCase()) && (!query || s.name.toLowerCase().includes(query))
    );
  }, [suggestions, appliedTags, query]);

  // Only offer "Create" when the typed name isn't already a known/applied tag.
  const isKnown =
    !!query &&
    (suggestions.some(s => s.name.toLowerCase() === query) ||
      appliedTags.some(t => t.toLowerCase() === query));
  const showCreate = query.length > 0 && query.length <= maxLength && !isKnown;

  // Close the dropdown + palette when clicking outside.
  React.useEffect(() => {
    if (!open && !showPalette) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowPalette(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, showPalette]);

  const addTag = (name: string, color: string) => {
    onAddTag(name, color);
    setValue('');
    setShowPalette(false);
    // Keep the field focused so several tags can be added in a row.
    inputRef.current?.focus();
  };

  const commitTyped = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) return;
    // If the typed text matches a known tag, reuse its color instead of the swatch.
    const match = suggestions.find(s => s.name.toLowerCase() === trimmed.toLowerCase());
    if (match) addTag(match.name, match.color);
    else addTag(toTitleCase(trimmed), selectedColor);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTyped();
    }
    if (e.key === 'Escape') {
      setShowPalette(false);
      setOpen(false);
    }
  };

  const dropdownOpen = open && !disabled && (filtered.length > 0 || showCreate);

  return (
    <div
      ref={containerRef}
      className="tag-input"
      style={{ ['--tag-color']: selectedColor } as React.CSSProperties}
    >
      {/* Color swatch — click to open the palette */}
      <button
        type="button"
        className="tag-input-swatch"
        style={{ backgroundColor: selectedColor }}
        onClick={() => setShowPalette(!showPalette)}
        disabled={disabled}
        title="Select color"
        aria-label="Select tag color"
      />

      {/* Color palette dropdown */}
      {showPalette && (
        <div className="tag-input-palette-dropdown">
          <ColorPalette
            selectedColor={selectedColor}
            onColorSelect={(color) => setSelectedColor(color)}
            compact
          />
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        className="tag-input-field"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
      />

      {/* Inline add — integrated into the field, active only when there's text */}
      <button
        type="button"
        className="tag-input-add"
        onClick={commitTyped}
        disabled={disabled || value.trim().length === 0}
        aria-label="Add tag"
        title="Add tag"
      >
        <Plus size={15} />
      </button>

      {/* Suggestions: pick an existing/default tag, or create the typed one */}
      {dropdownOpen && (
        <div className="tag-input-suggestions">
          {showCreate && (
            <button
              type="button"
              className="tag-input-create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={commitTyped}
            >
              <span className="tag-input-create-swatch" style={{ backgroundColor: selectedColor }} />
              <span className="tag-input-create-label">
                Create “{toTitleCase(value.trim())}”
              </span>
              <Plus size={14} className="tag-input-create-icon" />
            </button>
          )}
          {filtered.length > 0 && (
            <div className="tag-input-suggestion-list">
              {filtered.map(s => (
                <TagChip
                  key={s.name}
                  tag={s.name}
                  color={s.color}
                  onClick={() => addTag(s.name, s.color)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
