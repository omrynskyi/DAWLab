import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { toTitleCase } from './TagChip';
import { ColorPalette } from './ColorPalette';
import './TagInput.css';

interface TagInputProps {
  onAddTag: (tag: string, color: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  defaultColor?: string;
}

/**
 * TagInput — a single integrated field for creating a tag. The color swatch,
 * text input and add action live inside one chip-styled container that adopts
 * the selected tag color on focus. Enter or the inline + button commits.
 */
export const TagInput: React.FC<TagInputProps> = ({
  onAddTag,
  maxLength = 30,
  placeholder = 'Add tag...',
  disabled = false,
  defaultColor = '#007bff',
}) => {
  const [value, setValue] = useState('');
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [showPalette, setShowPalette] = useState(false);

  const canSubmit = value.trim().length > 0 && value.trim().length <= maxLength;

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed.length <= maxLength) {
      // Normalize to Title Case before adding
      onAddTag(toTitleCase(trimmed), selectedColor);
      setValue('');
      setShowPalette(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setShowPalette(false);
    }
  };

  return (
    <div
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
        type="text"
        className="tag-input-field"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
      />

      {/* Inline add — integrated into the field, active only when there's text */}
      <button
        type="button"
        className="tag-input-add"
        onClick={handleSubmit}
        disabled={disabled || !canSubmit}
        aria-label="Add tag"
        title="Add tag"
      >
        <Plus size={15} />
      </button>
    </div>
  );
};
