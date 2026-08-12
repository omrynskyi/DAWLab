import React, { useState } from 'react';
import './ColorPalette.css';

export const PRESET_COLORS = [
  { name: 'Blue', hex: '#007bff' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Cyan', hex: '#06b6d4' },
];

interface ColorPaletteProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  compact?: boolean;
}

/**
 * Color palette with preset swatches and a custom color picker option.
 */
export const ColorPalette: React.FC<ColorPaletteProps> = ({
  selectedColor,
  onColorSelect,
  compact = false,
}) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const handlePresetClick = (hex: string) => {
    onColorSelect(hex);
    setShowCustomPicker(false);
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onColorSelect(e.target.value);
  };

  const isPresetSelected = PRESET_COLORS.some(c => c.hex === selectedColor);

  return (
    <div className={`color-palette ${compact ? 'compact' : ''}`}>
      <div className="color-palette-swatches">
        {PRESET_COLORS.map(color => (
          <button
            key={color.hex}
            className={`color-swatch ${selectedColor === color.hex ? 'selected' : ''}`}
            style={{ backgroundColor: color.hex }}
            onClick={() => handlePresetClick(color.hex)}
            title={color.name}
            type="button"
          />
        ))}
        {/* Custom color picker toggle */}
        <button
          className={`color-swatch custom-picker-toggle ${!isPresetSelected && selectedColor !== '#007bff' ? 'selected' : ''}`}
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          title="Custom color"
          type="button"
        >
          <span className="custom-picker-icon">🎨</span>
        </button>
      </div>
      
      {showCustomPicker && (
        <div className="custom-picker-row">
          <input
            type="color"
            className="custom-color-input"
            value={selectedColor}
            onChange={handleCustomColorChange}
          />
          <span className="custom-color-hex">{selectedColor}</span>
        </div>
      )}
      
      {/* Selected color preview */}
      <div className="selected-color-preview">
        <span 
          className="preview-swatch" 
          style={{ backgroundColor: selectedColor }}
        />
        <span className="preview-label">Selected</span>
      </div>
    </div>
  );
};
