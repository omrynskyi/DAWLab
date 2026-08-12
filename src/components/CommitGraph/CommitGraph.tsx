/**
 * CommitGraph.tsx - Updated Component with Box Selection
 *
 * Box highlights selected commit (default: first commit)
 * Double-click icon to open project
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import "./CommitGraph.css";
import { Bookmark, Check, RotateCcw, Music } from "lucide-react";
import { ContextMenu, createCommitMenuItems } from "@/components/ContextMenu";
import { InputModal } from "@/components/InputModal";
import { useClickOutside } from "@/hooks/useClickOutside";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CommitData {
  commit_id: string;
  timestamp: string;
  message: string;
  author: string;
  preview_file?: string;
}

export interface CommitGraphProps {
  commits: CommitData[];
  onCheckout: (commitId: string) => void;
  onDeleteCommit?: (commitId: string) => void;
  onBranchCreate?: (branchName: string, fromCommitId: string) => Promise<void>;
  currentCommitId?: string;
  lastCheckoutTimestamp?: string; // Added to identify newer remote commits
  hasUnsavedChanges?: boolean;
  restoringCommitId?: string | null;
  projectName: string;
  projectId?: string;
  currentBranch: string;
  onSaveCommit?: (message: string) => void; // Added for the "Save" card
  onCancelSave?: () => void;
  isCommitting?: boolean;
  isCreatingCommit?: boolean;
  selectedCommitId?: string | null;
  onCommitSelect?: (commitId: string) => void;
}

// ============================================================================
// COMMIT STATUS TYPES
// ============================================================================

type CommitStatus = "current" | "modified" | "sync" | "restorable";

const getCommitStatus = (
  commit: CommitData,
  currentCommitId: string | undefined,
  lastCheckoutTimestamp: string | undefined,
  hasUnsavedChanges: boolean,
): CommitStatus => {
  const isCurrentOnDevice =
    String(commit.commit_id) === String(currentCommitId);

  if (isCurrentOnDevice) {
    return hasUnsavedChanges ? "modified" : "current";
  }

  // If this commit is newer than the last checkout, it's a sync candidate
  if (lastCheckoutTimestamp && commit.timestamp > lastCheckoutTimestamp) {
    return "sync";
  }

  return "restorable";
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatTimestamp = (timestamp: string): string => {
  if (!timestamp || timestamp.length < 12) return timestamp;

  const year = timestamp.slice(0, 4);
  const month = timestamp.slice(4, 6);
  const day = timestamp.slice(6, 8);
  const hour = timestamp.slice(8, 10);
  const minute = timestamp.slice(10, 12);

  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);

  const monthName = date.toLocaleString("en-US", { month: "short" });
  const dayWithSuffix = getDayWithSuffix(date.getDate());
  const yearNum = date.getFullYear();
  const time = date
    .toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

  return `${monthName} ${dayWithSuffix}, ${yearNum} ${time}`;
};

const getDayWithSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) return `${day}th`;

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
};

/**
 * Parse commit message and render with clickable links for branch creation messages
 * Pattern: "Created branch X from Y" where Y is a commit ID
 */
const renderCommitMessage = (
  message: string,
  onCommitClick: (commitId: string) => void,
): React.ReactNode => {
  // Pattern to match "Created branch <name> from <commitId>"
  const branchPattern = /^Created branch (.+) from ([a-zA-Z0-9]+)$/;
  const match = message.match(branchPattern);

  if (match) {
    const branchName = match[1];
    const commitId = match[2];

    return (
      <span>
        Created branch <strong>{branchName}</strong> from{" "}
        <span
          className="commit-link"
          onClick={(e) => {
            e.stopPropagation();
            onCommitClick(commitId);
          }}
          title={`Jump to commit ${commitId}`}
        >
          {commitId}
        </span>
      </span>
    );
  }

  // Default: return message as-is
  return message || "No message";
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CommitGraph: React.FC<CommitGraphProps> = ({
  commits,
  onCheckout,
  onDeleteCommit,
  onBranchCreate,
  currentCommitId,
  lastCheckoutTimestamp,
  hasUnsavedChanges = false,
  restoringCommitId,
  projectName,
  currentBranch,
  onSaveCommit,
  onCancelSave,
  isCommitting = false,
  isCreatingCommit = false,
  selectedCommitId: selectedCommitIdProp,
  onCommitSelect,
}) => {
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [_currentPage, _setCurrentPage] = useState<number>(0); // Keeping state for now but layout is horizontal
  const [newCommitMessage, setNewCommitMessage] = useState("");
  const [isExiting, setIsExiting] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use prop if provided (even if null), otherwise use local state fallback
  const effectiveSelectedCommitId = selectedCommitIdProp ?? selectedCommitId;

  // Enable vertical-to-horizontal scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // If we are scrolling vertically, move the container horizontally instead
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    commitId: string;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Branch modal state
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchFromCommitId, setBranchFromCommitId] = useState<string | null>(
    null,
  );
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);

  // Preview state
  const [_previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [previewingCommitId, setPreviewingCommitId] = useState<string | null>(
    null,
  );

  // Close context menu on click outside
  useClickOutside(
    contextMenuRef,
    useCallback(() => setContextMenu(null), []),
    !!contextMenu,
  );

  // Set first commit (newest) as selected by default
  // Update selection whenever commits change (e.g., after creating a new commit)
  useEffect(() => {
    if (commits.length > 0) {
      // Sort to get the newest commit (highest timestamp)
      const sortedCommits = [...commits].sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp),
      );
      const newestCommitId = sortedCommits[0].commit_id;

      // Only update if the newest commit is different from the currently selected one
      // This ensures new commits are automatically selected
      if (selectedCommitId !== newestCommitId) {
        setSelectedCommitId(newestCommitId);
      }
    }
    // Intentionally only re-run when the commit list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commits]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleRowClick = (commitId: string) => {
    // Call parent handler if provided
    if (onCommitSelect) {
      onCommitSelect(commitId);
    }
    // Also update local state for internal tracking/fallback
    setSelectedCommitId(commitId);

    // Find which page this commit is on and navigate there
    const sortedCommits = [...commits].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
    // Find which page this commit is on (keeping logic if pagination is ever restored)
    const commitIndex = sortedCommits.findIndex(
      (c) => String(c.commit_id) === String(commitId),
    );

    if (commitIndex !== -1) {
      const pageIndex = Math.floor(commitIndex / 10);
      if (pageIndex !== _currentPage) {
        _setCurrentPage(pageIndex);
      }
    }
  };

  const handleCheckoutClick = (e: React.MouseEvent, commitId: string) => {
    e.stopPropagation();
    onCheckout(commitId);
  };

  // Listen for preview status updates from main process
  useEffect(() => {
    const handleStatusUpdate = (_event: any, status: string) => {
      setPreviewStatus(status);
      // Forward to notification component via custom event
      window.dispatchEvent(
        new CustomEvent("preview-status-update", {
          detail: { status },
        }),
      );
    };

    window.ipcRenderer.on("preview-status-update", handleStatusUpdate);

    return () => {
      window.ipcRenderer.removeAllListeners("preview-status-update");
      // Cleanup preview files when component unmounts
      window.ipcRenderer
        .invoke("cleanup-preview")
        .catch((err: any) => console.error("Cleanup failed:", err));
    };
  }, []);

  // Context menu handler for commits
  const handleCommitContextMenu = (e: React.MouseEvent, commitId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, commitId });
  };

  // Handler when "Branch from this Commit" is clicked
  const handleBranchFromCommit = () => {
    if (contextMenu) {
      setBranchFromCommitId(contextMenu.commitId);
      setContextMenu(null);
      setShowBranchModal(true);
    }
  };

  // Handler when "Delete Commit" is clicked
  const handleDeleteCommit = () => {
    if (contextMenu && onDeleteCommit) {
      onDeleteCommit(contextMenu.commitId);
      setContextMenu(null);
    }
  };

  // Handler when "Preview this Version" is clicked
  const handlePreviewCommit = async () => {
    if (!contextMenu) return;

    const commitId = contextMenu.commitId;
    setContextMenu(null);

    // Prevent multiple simultaneous previews
    if (previewingCommitId) {
      console.log("[CommitGraph] Preview already in progress");
      return;
    }

    setPreviewingCommitId(commitId);
    setPreviewStatus("Preparing...");

    // Dispatch event to show notification
    window.dispatchEvent(
      new CustomEvent("preview-start", {
        detail: { commitId, projectName, branch: currentBranch },
      }),
    );

    try {
      console.log(
        "[CommitGraph] Previewing commit:",
        commitId,
        "from branch:",
        currentBranch,
      );
      await window.ipcRenderer.invoke(
        "preview-project",
        projectName,
        commitId,
        currentBranch,
      );
      console.log("[CommitGraph] Preview opened successfully");

      // Dispatch completion event
      window.dispatchEvent(
        new CustomEvent("preview-complete", {
          detail: { commitId },
        }),
      );
    } catch (error: any) {
      console.error("[CommitGraph] Preview failed:", error);
      alert(`Preview failed: ${error?.message || "Unknown error"}`);

      // Dispatch failure event to hide notification
      window.dispatchEvent(new CustomEvent("preview-complete"));
    } finally {
      setPreviewingCommitId(null);
      setPreviewStatus(null);
    }
  };

  // Close the branch modal
  const handleCloseBranchModal = () => {
    setShowBranchModal(false);
    setBranchName("");
    setBranchFromCommitId(null);
  };

  // Handle branch creation
  const handleCreateBranch = async () => {
    if (!branchName.trim()) {
      console.error("[CommitGraph] Branch name cannot be empty");
      return;
    }

    if (!branchFromCommitId) {
      console.error("[CommitGraph] No commit ID specified for branch creation");
      return;
    }

    setIsCreatingBranch(true);
    try {
      console.log("[CommitGraph] Creating branch:", {
        branchName: branchName.trim(),
        fromCommitId: branchFromCommitId,
      });

      if (onBranchCreate) {
        await onBranchCreate(branchName.trim(), branchFromCommitId);
      }

      handleCloseBranchModal();
    } catch (error) {
      console.error("[CommitGraph] Error creating branch:", error);
      // Keep modal open on error so user can retry
    } finally {
      setIsCreatingBranch(false);
    }
  };

  // ============================================================================
  // PAGINATION CALCULATIONS
  // ============================================================================

  // Sort commits by timestamp in descending order (newest first)
  const sortedCommits = [...commits].sort((a, b) => {
    // Compare timestamps as strings (format: YYYYMMDDHHmmss)
    return b.timestamp.localeCompare(a.timestamp);
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  if (commits.length === 0) {
    return (
      <div className="commit-graph-wrapper">
        <h2 className="commit-graph-title">Last Snapshot</h2>
        <div className="commit-graph-container">
          <div className="commit-graph-empty">
            <p>No saves to display</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="commit-graph-wrapper">
      <div
        className="commit-graph-container horizontal-scroll"
        ref={scrollContainerRef}
      >
        <div className="commit-cards-list">
          {/* New Commit / Save Card - show if unsaved changes OR user explicitly clicked save */}
          {(hasUnsavedChanges || isCreatingCommit || isExiting) &&
            onSaveCommit && (
              <div
                className={`commit-card save-card modified ${isExiting ? "animate-slide-out" : "animate-slide-in"}`}
              >
                <div className="card-content">
                  <textarea
                    className="version-input"
                    placeholder="Enter a version message..."
                    value={newCommitMessage}
                    onChange={(e) => setNewCommitMessage(e.target.value)}
                  />
                  <div className="card-footer">
                    <div className="flex justify-between items-center w-full mt-2">
                      <span className="text-xs text-gray-500">
                        {new Date().toLocaleDateString()}
                      </span>
                      <span className="text-xs text-gray-500">me</span>
                    </div>
                  </div>
                </div>
                <div className="card-action">
                  <div className="flex gap-2">
                    {isCreatingCommit && !hasUnsavedChanges && (
                      <button
                        className="cancel-version-button"
                        onClick={() => {
                          setIsExiting(true);
                          setTimeout(() => {
                            setNewCommitMessage("");
                            setIsExiting(false);
                            if (onCancelSave) onCancelSave();
                          }, 400);
                        }}
                        disabled={isCommitting || isExiting}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      className="save-version-button"
                      onClick={() => {
                        onSaveCommit(newCommitMessage);
                      }}
                      disabled={isCommitting || !newCommitMessage.trim()}
                    >
                      {isCommitting ? "Saving..." : "Save"}{" "}
                      <Bookmark
                        className="ml-2"
                        style={{ color: "#eab308" }}
                        size={16}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

          {sortedCommits.map((commit) => {
            const isSelected = effectiveSelectedCommitId === commit.commit_id;
            const status = getCommitStatus(
              commit,
              currentCommitId,
              lastCheckoutTimestamp,
              hasUnsavedChanges,
            );
            const isRestoring =
              String(restoringCommitId) === String(commit.commit_id);

            return (
              <motion.div
                key={commit.commit_id}
                layout
                initial={false}
                animate={{
                  scale: isSelected ? 1.02 : 1,
                  boxShadow: isSelected
                    ? "0 10px 30px -10px rgba(0,0,0,0.5)"
                    : "0 4px 12px -2px rgba(0,0,0,0.1)",
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
                className={`commit-card ${status} ${isSelected ? "selected" : ""}`}
                onClick={() => handleRowClick(commit.commit_id)}
                onContextMenu={(e) =>
                  handleCommitContextMenu(e, commit.commit_id)
                }
              >
                <div className="card-content">
                  <div className="commit-message-full">
                    {renderCommitMessage(commit.message, (id) =>
                      handleRowClick(id),
                    )}
                  </div>

                  <div className="card-footer">
                    <div className="flex items-center gap-2">
                      <span className="timestamp">
                        {formatTimestamp(commit.timestamp).split(",")[0]}
                      </span>
                      {commit.preview_file && (
                        <Music size={12} className="text-blue-400" />
                      )}
                    </div>
                    <span className="author">{commit.author || "Unknown"}</span>
                  </div>
                </div>

                <div className="card-action">
                  <button
                    className={`status-button ${isRestoring ? "restoring" : status}`}
                    onClick={(e) => handleCheckoutClick(e, commit.commit_id)}
                    disabled={isRestoring || status === "current"}
                  >
                    {isRestoring ? (
                      <>
                        <RotateCcw
                          className="animate-spin-reverse mr-2"
                          size={18}
                        />{" "}
                        Restoring
                      </>
                    ) : status === "current" ? (
                      <>
                        On Device <Check className="ml-2" size={18} />
                      </>
                    ) : status === "modified" ? (
                      <>
                        On Device <Check className="ml-2" size={18} />
                      </>
                    ) : status === "sync" ? (
                      <>
                        Sync <RotateCcw className="ml-2" size={18} />
                      </>
                    ) : (
                      <>
                        Restore <RotateCcw className="ml-2" size={18} />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Commit Context Menu */}
      {contextMenu && (
        <ContextMenu
          ref={contextMenuRef}
          x={contextMenu.x}
          y={contextMenu.y}
          items={createCommitMenuItems(
            handlePreviewCommit,
            handleBranchFromCommit,
            onDeleteCommit ? handleDeleteCommit : undefined,
          )}
        />
      )}

      {/* Branch From Commit Modal */}
      <InputModal
        isOpen={showBranchModal}
        title="Create Branch"
        label="Branch Name"
        value={branchName}
        onChange={setBranchName}
        onSubmit={handleCreateBranch}
        onClose={handleCloseBranchModal}
        placeholder="Enter branch name..."
        submitText="Create Branch"
        cancelText="Cancel"
        isLoading={isCreatingBranch}
        loadingText="Creating branch..."
      />
    </div>
  );
};
