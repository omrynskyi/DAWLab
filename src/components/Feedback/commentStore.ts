import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment, TagRef } from "./CommentCard";

/**
 * Comment storage and edits shared by the full-screen feedback view and the
 * History page's comments panel. Comments live in one comments.json per
 * version (see the get/save-commit-comments IPC handlers).
 */

/** Id of the unsaved comment being typed; never persisted. */
export const DRAFT_ID = "__draft__";

const SAVE_DELAY_MS = 400;

export const newCommentId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Loads a version's comments and saves every change back (debounced, flushed
 * when the version changes or the component unmounts).
 */
export function useCommitComments(projectName: string, commitId: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The version the in-memory comments were loaded from; null blocks saving.
  const commentsCommitRef = useRef<string | null>(null);
  // Last saved-or-scheduled comments, serialized, so no-op edits skip the disk.
  const savedJsonRef = useRef<string>("[]");
  const pendingSaveRef = useRef<{ commitId: string; comments: Comment[] } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flushSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending) return;
    window.ipcRenderer
      .invoke("save-commit-comments", projectName, pending.commitId, pending.comments)
      .catch((err: unknown) => console.error("[Feedback] Failed to save comments:", err));
  }, [projectName]);

  useEffect(() => {
    flushSave();
    commentsCommitRef.current = null;
    setLoaded(false);
    setComments([]);
    if (!commitId) return;
    let cancelled = false;
    window.ipcRenderer
      .invoke("get-commit-comments", projectName, commitId)
      .then((data: Comment[]) => {
        if (cancelled) return;
        const loadedComments = Array.isArray(data) ? data : [];
        commentsCommitRef.current = commitId;
        savedJsonRef.current = JSON.stringify(loadedComments);
        setComments(loadedComments);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        // Leave saving blocked so a failed read can't overwrite the file.
        console.warn("Failed to fetch comments:", err);
      });
    return () => { cancelled = true; };
  }, [commitId, projectName, flushSave]);

  useEffect(() => {
    const target = commentsCommitRef.current;
    if (!loaded || !target) return;
    const toSave = comments.filter(c => c.id !== DRAFT_ID);
    const json = JSON.stringify(toSave);
    // Unchanged since the last write we made or scheduled (e.g. a draft opened
    // then cancelled) — nothing to do; a pending write of it still goes out.
    if (json === savedJsonRef.current) return;
    savedJsonRef.current = json;
    pendingSaveRef.current = { commitId: target, comments: toSave };
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DELAY_MS);
  }, [comments, loaded, flushSave]);

  // Don't drop the last edit when the view closes.
  useEffect(() => flushSave, [flushSave]);

  return { comments, setComments, loaded };
}

// ── Pure edits (return a new list; callers decide about undo history) ──

export function withTag(comments: Comment[], commentId: string, tag: TagRef): Comment[] {
  return comments.map(c => {
    if (c.id !== commentId) return c;
    const existing = c.tags || [];
    if (existing.some(t => t.name === tag.name)) return c;
    return { ...c, tags: [...existing, tag] };
  });
}

export function withoutTag(comments: Comment[], commentId: string, tagName: string): Comment[] {
  return comments.map(c => {
    if (c.id !== commentId) return c;
    return { ...c, tags: (c.tags || []).filter(t => t.name !== tagName) };
  });
}

export function withReply(comments: Comment[], commentId: string, username: string, text: string): Comment[] {
  const reply = { id: newCommentId(), username, comment: text, timestamp: Date.now() / 1000 };
  return comments.map(c =>
    c.id !== commentId ? c : { ...c, replies: [...(c.replies || []), reply] }
  );
}

export function withoutReply(comments: Comment[], commentId: string, replyId: string): Comment[] {
  return comments.map(c =>
    c.id !== commentId ? c : { ...c, replies: (c.replies || []).filter(r => r.id !== replyId) }
  );
}

export function withoutComment(comments: Comment[], commentId: string): Comment[] {
  return comments.filter(c => c.id !== commentId);
}

/** Appends a new comment (replacing any open draft) over a time range. */
export function withNewComment(
  comments: Comment[],
  fields: { username: string; authorColor?: string; comment: string; timestamp: number; endTimestamp: number },
): Comment[] {
  return [...comments.filter(c => c.id !== DRAFT_ID), { id: newCommentId(), ...fields }];
}

/** The comment to highlight: an explicit focus wins, else the one under the playhead. */
export function activeCommentId(comments: Comment[], focusedId: string | null, time: number): string | null {
  if (focusedId) return focusedId;
  for (const c of comments) {
    if (c.id === DRAFT_ID) continue;
    const end = c.endTimestamp ?? c.timestamp + 5;
    if (time >= c.timestamp && time <= end) return c.id;
  }
  return null;
}

// ── Commenter colour (tints the author pill on each comment) ──

const USER_PALETTE = ["#4ade80", "#f87171", "#7eaaee", "#fbbf24", "#c084fc"];
const USER_COLOR_KEY = "dawlab_user_color";

export function loadUserColor(): string {
  try {
    const stored = localStorage.getItem(USER_COLOR_KEY);
    if (stored) return stored;
    const color = USER_PALETTE[Math.floor(Math.random() * USER_PALETTE.length)];
    localStorage.setItem(USER_COLOR_KEY, color);
    return color;
  } catch {
    return USER_PALETTE[0];
  }
}
