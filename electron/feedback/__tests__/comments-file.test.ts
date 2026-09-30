import { describe, expect, it } from 'vitest';
import { COMMENTS_FORMAT_VERSION, parseCommentsFile, serializeComments } from '../comments-file';

const comment = { id: 'a', username: 'oleg', comment: 'turn bass down', timestamp: 104.8 };

describe('comments.json format', () => {
  it('round-trips through the versioned wrapper', () => {
    const file = serializeComments([comment]);
    expect(file).toEqual({ version: COMMENTS_FORMAT_VERSION, comments: [comment] });
    expect(parseCommentsFile(JSON.stringify(file))).toEqual([comment]);
  });

  it('reads the pre-release bare-list shape', () => {
    expect(parseCommentsFile(JSON.stringify([comment]))).toEqual([comment]);
    expect(parseCommentsFile('[]')).toEqual([]);
  });

  it('refuses files from a newer DAWLab instead of guessing', () => {
    const newer = JSON.stringify({ version: COMMENTS_FORMAT_VERSION + 1, comments: [comment] });
    expect(() => parseCommentsFile(newer)).toThrow(/Update DAWLab/);
  });

  it('refuses corrupt or unrecognised files', () => {
    expect(() => parseCommentsFile('{"comm')).toThrow();
    expect(() => parseCommentsFile('{"comments": []}')).toThrow(/recognised/);
    expect(() => parseCommentsFile('"hello"')).toThrow(/recognised/);
  });
});
