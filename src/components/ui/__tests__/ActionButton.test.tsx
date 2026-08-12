import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionButton } from '../ActionButton';

/**
 * Component Tests for ActionButton
 * 
 * Pattern Principles:
 * 1. Describable: Use clear 'describe' and 'it' blocks.
 * 2. Readable: Test one thing at a time.
 * 3. User-Centric: Use 'screen' queries that resemble user interaction (getByRole, getByText).
 */
describe('ActionButton', () => {

    // Test 1: Basic Rendering
    it('renders the button with children text', () => {
        // Arrange
        const buttonText = 'Click Me';

        // Act
        render(<ActionButton variant="primary">{buttonText}</ActionButton>);

        // Assert
        const buttonElement = screen.getByRole('button', { name: buttonText });
        expect(buttonElement).toBeInTheDocument();
    });

    // Test 2: Props & Styling (Variant)
    it('applies the correct styling class for "destructive" variant', () => {
        // Arrange
        const label = 'Delete';

        // Act
        render(<ActionButton variant="destructive">{label}</ActionButton>);

        // Assert
        const buttonElement = screen.getByRole('button', { name: label });
        // Check for a specific class associated with the variant (based on implementation)
        expect(buttonElement).toHaveClass('text-[#ef4444]');
    });

    // Test 3: Interaction (Click Handling)
    it('calls the onClick handler when clicked', () => {
        // Arrange
        const handleClick = vi.fn();
        render(<ActionButton variant="save" onClick={handleClick}>Save</ActionButton>);

        // Act
        const buttonElement = screen.getByRole('button', { name: 'Save' });
        fireEvent.click(buttonElement);

        // Assert
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    // Test 4: Attribute Forwarding (Disabled State)
    it('forwards additional props (like disabled) to the native button', () => {
        // Arrange & Act
        render(<ActionButton variant="primary" disabled>Can't Click</ActionButton>);

        // Assert
        const buttonElement = screen.getByRole('button', { name: "Can't Click" });
        expect(buttonElement).toBeDisabled();
    });
});
