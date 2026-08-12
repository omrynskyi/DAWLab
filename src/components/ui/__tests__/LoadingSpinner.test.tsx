import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
    // Test 1: Default Rendering
    it('renders the inline spinner by default', () => {
        const { container } = render(<LoadingSpinner />);
        // Check for the specific class that defines the inline variant
        expect(container.querySelector('.loading-spinner.inline')).toBeInTheDocument();
    });

    // Test 2: Conditional Rendering (Button Text)
    it('renders button text when provided in "button" variant', () => {
        const text = 'Processing...';
        render(<LoadingSpinner variant="button" buttonText={text} />);

        expect(screen.getByText(text)).toBeInTheDocument();
        // Verify structure specific to button variant
        expect(screen.getByText(text)).toHaveClass('button-loading-text');
    });

    // Test 3: Complex UI State (Overlay with Message)
    it('renders message and submessage in "overlay" variant', () => {
        const message = 'Uploading Project';
        const submessage = 'Please wait...';

        render(<LoadingSpinner variant="overlay" message={message} submessage={submessage} />);

        expect(screen.getByText(message)).toBeVisible();
        expect(screen.getByText(submessage)).toBeVisible();
    });
});
