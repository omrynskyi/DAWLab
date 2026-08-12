import React, { useState } from 'react';
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
 * TagInput component for adding new tags with color palette selection.
 * Enforces max character limit and provides visual feedback.
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
    <div className="tag-input-container">
      {/* Color button showing selected color */}
      <button
        type="button"
        className="tag-input-color-btn"
        style={{ backgroundColor: selectedColor }}
        onClick={() => setShowPalette(!showPalette)}
        disabled={disabled}
        title="Select color"
      />
      
      {/* Color palette dropdown */}
      {showPalette && (
        <div className="tag-input-palette-dropdown">
          <ColorPalette
            selectedColor={selectedColor}
            onColorSelect={(color) => {
              setSelectedColor(color);
            }}
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
      <button
        type="button"
        className="tag-input-button"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
      >
        +Add
      </button>
    </div>
  );
};
