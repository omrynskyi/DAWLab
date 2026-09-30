/**
 * On-disk format of a version's feedback comments (comments.json):
 *
 *   { "version": 1, "comments": [ ... ] }
 *
 * Bump COMMENTS_FORMAT_VERSION when the shape changes and migrate older
 * versions in parseCommentsFile, so files from earlier releases keep loading.
 */
export const COMMENTS_FORMAT_VERSION = 1;

export interface CommentsFile {
  version: number;
  comments: unknown[];
}

/**
 * Reads comments.json. Throws on anything it can't safely read — corrupt JSON,
 * an unknown shape, or a file written by a newer DAWLab — so callers never
 * overwrite data they didn't understand.
 */
export function parseCommentsFile(text: string): unknown[] {
  const data: unknown = JSON.parse(text);
  // Pre-release builds wrote a bare list; treat it as version 1.
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const { version, comments } = data as Partial<CommentsFile>;
    if (typeof version === "number" && Number.isInteger(version) && Array.isArray(comments)) {
      if (version > COMMENTS_FORMAT_VERSION) {
        throw new Error(
          `comments.json is format v${version}; this DAWLab reads up to v${COMMENTS_FORMAT_VERSION}. Update DAWLab to open it.`,
        );
      }
      return comments;
    }
  }
  throw new Error("comments.json isn't in a recognised format");
}

export function serializeComments(comments: unknown[]): CommentsFile {
  return { version: COMMENTS_FORMAT_VERSION, comments };
}
