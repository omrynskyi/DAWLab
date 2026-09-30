import { describe, expect, it } from 'vitest';
import { audioMimeType, resolveRange } from '../range';

describe('resolveRange', () => {
  it('serves the whole file without a Range header', () => {
    expect(resolveRange(undefined, 100)).toEqual({ kind: 'full', start: 0, end: 99 });
  });

  it('parses open-ended, bounded and suffix ranges', () => {
    expect(resolveRange('bytes=10-', 100)).toEqual({ kind: 'partial', start: 10, end: 99 });
    expect(resolveRange('bytes=10-19', 100)).toEqual({ kind: 'partial', start: 10, end: 19 });
    expect(resolveRange('bytes=-20', 100)).toEqual({ kind: 'partial', start: 80, end: 99 });
  });

  it('clamps an end past the file and a suffix longer than the file', () => {
    expect(resolveRange('bytes=90-500', 100)).toEqual({ kind: 'partial', start: 90, end: 99 });
    expect(resolveRange('bytes=-500', 100)).toEqual({ kind: 'partial', start: 0, end: 99 });
  });

  it('rejects malformed or unsatisfiable ranges', () => {
    for (const h of ['bytes=-', 'items=0-1', 'bytes=100-', 'bytes=50-10', 'bytes=-0', 'garbage']) {
      expect(resolveRange(h, 100)).toEqual({ kind: 'unsatisfiable' });
    }
    expect(resolveRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
  });
});

describe('audioMimeType', () => {
  it('maps known extensions and defaults extensionless CAS files to mpeg', () => {
    expect(audioMimeType('.WAV')).toBe('audio/wav');
    expect(audioMimeType('.m4a')).toBe('audio/mp4');
    expect(audioMimeType('')).toBe('audio/mpeg');
  });
});
