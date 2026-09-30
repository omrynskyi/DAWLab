import { useCallback, useMemo, useState } from "react";
import SidebarCommentList from "./SidebarCommentList";
import { PRESET_TAGS, type Comment, type TagRef } from "./CommentCard";
import {
  activeCommentId,
  loadUserColor,
  useCommitComments,
  withNewComment,
  withReply,
  withTag,
  withoutComment,
  withoutReply,
  withoutTag,
} from "./commentStore";
import "./Feedback.css";

interface VersionCommentsProps {
  projectName: string;
  /** Version whose comments to show; null when it has no preview. */
  commitId: string | null;
  username: string;
  /** The History player's playhead, for highlighting and new comments. */
  currentTime: number;
  /** Play the History player from a comment's start. */
  onPlayFrom: (seconds: number) => void;
}

/**
 * The full-screen feedback view's comment sidebar, docked in the History page:
 * same cards and composer, reading and writing the same comments.json.
 */
export function VersionComments({ projectName, commitId, username, currentTime, onPlayFrom }: VersionCommentsProps) {
  const { comments, setComments } = useCommitComments(projectName, commitId);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [userColor] = useState(loadUserColor);

  const highlightId = useMemo(
    () => activeCommentId(comments, focusedCommentId, currentTime),
    [comments, focusedCommentId, currentTime],
  );

  // Tags used on this version beyond the presets, offered in the tag picker.
  const customTags = useMemo(() => {
    const map = new Map<string, TagRef>();
    for (const c of comments) {
      for (const t of c.tags || []) {
        if (!PRESET_TAGS.some(p => p.name === t.name)) map.set(t.name, t);
      }
    }
    return Array.from(map.values());
  }, [comments]);

  const handleDoubleClick = useCallback((comment: Comment) => {
    setFocusedCommentId(comment.id);
    onPlayFrom(comment.timestamp);
  }, [onPlayFrom]);

  return (
    <div className="version-comments">
      <div className="feedback-page version-comments__panel">
        <div className="version-comments__label">Comments</div>
        {commitId ? (
          <SidebarCommentList
            comments={comments}
            focusedCommentId={highlightId}
            currentTime={currentTime}
            onCommentClick={(c) => setFocusedCommentId(c.id)}
            onCommentDoubleClick={handleDoubleClick}
            onDeselect={() => setFocusedCommentId(null)}
            onAddTag={(id, tag) => setComments(prev => withTag(prev, id, tag))}
            onRemoveTag={(id, name) => setComments(prev => withoutTag(prev, id, name))}
            onAddReply={(id, text) => setComments(prev => withReply(prev, id, username, text))}
            onDeleteComment={(id) => {
              setComments(prev => withoutComment(prev, id));
              setFocusedCommentId(prev => (prev === id ? null : prev));
            }}
            onDeleteReply={(id, replyId) => setComments(prev => withoutReply(prev, id, replyId))}
            allCustomTags={customTags}
            onDraftSubmit={(comment, timestamp, endTimestamp) =>
              setComments(prev => withNewComment(prev, { username, authorColor: userColor, comment, timestamp, endTimestamp }))
            }
          />
        ) : (
          <div className="version-comments__empty">
            Attach a preview to this version to comment on it.
          </div>
        )}
      </div>
    </div>
  );
}
