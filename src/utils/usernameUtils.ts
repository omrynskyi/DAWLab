/**
 * Username Validation and Generation Utilities
 */

import type { UsernameValidation } from '../types/user.types';

/**
 * Validates a username according to the rules:
 * - 3-30 characters
 * - Lowercase letters, numbers, and underscores only
 * - Must be lowercase
 */
export function validateUsername(username: string): UsernameValidation {
  if (!username || username.trim().length === 0) {
    return {
      isValid: false,
      error: 'Username is required'
    };
  }

  const trimmedUsername = username.trim();

  // Length check
  if (trimmedUsername.length < 3) {
    return {
      isValid: false,
      error: 'Username must be at least 3 characters'
    };
  }

  if (trimmedUsername.length > 30) {
    return {
      isValid: false,
      error: 'Username must be 30 characters or less'
    };
  }

  // Format check (lowercase alphanumeric + underscore)
  const validFormat = /^[a-z0-9_]+$/;
  if (!validFormat.test(trimmedUsername)) {
    return {
      isValid: false,
      error: 'Username can only contain lowercase letters, numbers, and underscores'
    };
  }

  // Lowercase check
  if (trimmedUsername !== trimmedUsername.toLowerCase()) {
    return {
      isValid: false,
      error: 'Username must be lowercase'
    };
  }

  // All checks passed
  return {
    isValid: true
  };
}

/**
 * Sanitize a username input to make it valid
 */
export function sanitizeUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 30);
}
