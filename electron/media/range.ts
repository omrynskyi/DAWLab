/**
 * HTTP Range header parsing for serving audio files. Chromium's media stack
 * seeks — and resumes after the app was backgrounded — with `Range: bytes=N-`
 * requests, so playback servers must honour them.
 */

export type ByteRange =
  | { kind: 'full'; start: number; end: number }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' };

/** Resolve a Range header against a file of `size` bytes. Inclusive `end`. */
export function resolveRange(header: string | null | undefined, size: number): ByteRange {
  if (!header) return { kind: 'full', start: 0, end: size - 1 };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return { kind: 'unsatisfiable' };

  let start: number;
  let end = size - 1;
  if (match[1] === '') {
    // Suffix range: the last N bytes.
    const suffix = parseInt(match[2], 10);
    if (suffix === 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - suffix);
  } else {
    start = parseInt(match[1], 10);
    if (match[2] !== '') end = Math.min(end, parseInt(match[2], 10));
  }
  if (size === 0 || start >= size || start > end) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start, end };
}

export const AUDIO_MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aif': 'audio/x-aiff',
  '.aiff': 'audio/x-aiff',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

/** Content-Type for a file. Extensionless CAS objects fall back to audio/mpeg; Chromium sniffs the real format. */
export function audioMimeType(ext: string): string {
  return AUDIO_MIME_TYPES[ext.toLowerCase()] ?? 'audio/mpeg';
}
