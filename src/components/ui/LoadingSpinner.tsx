import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  /** Size variant of the spinner */
  variant?: 'button' | 'overlay' | 'page' | 'inline';
  /** Color variant */
  color?: 'white' | 'blue';
  /** Message to display (for overlay and page variants) */
  message?: string;
  /** Secondary message (for overlay and page variants) */
  submessage?: string;
  /** Text to show next to button spinner */
  buttonText?: string;
}

/**
 * A reusable loading spinner component with multiple variants:
 * - `button`: Small spinner for inside buttons (18px)
 * - `overlay`: Medium spinner with backdrop for modals (48px)
 * - `page`: Full-page loading screen (64px)
 * - `inline`: For inline loading states (24px)
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  variant = 'inline',
  color = 'white',
  message,
  submessage,
  buttonText,
}) => {
  if (variant === 'button') {
    return (
      <div className="button-loading-container">
        <div className={`loading-spinner button ${color}`} />
        {buttonText && <span className="button-loading-text">{buttonText}</span>}
      </div>
    );
  }

  if (variant === 'overlay') {
    return (
      <div className="loading-overlay">
        <div className={`loading-spinner overlay ${color}`} />
        {message && (
          <div>
            <div className="loading-overlay-message">{message}</div>
            {submessage && <div className="loading-overlay-submessage">{submessage}</div>}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'page') {
    return (
      <div className="loading-page">
        <div className={`loading-spinner page ${color}`} />
        {message && <div className="loading-page-message">{message}</div>}
      </div>
    );
  }

  // inline variant (default)
  return (
    <div className="loading-inline">
      <div className={`loading-spinner inline ${color}`} />
    </div>
  );
};
