/**
 * History.tsx
 *
 * Main component for displaying commit history visualization
 *
 * Features:
 * - Project selection dropdown
 * - Branch selection dropdown
 * - Visual commit graph with branching
 * - Checkout buttons for each commit
 * - Branch legend showing all branches
 *
 * The heavy logic for graph reconstruction is in utils/commitGraphUtils.ts
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "motion/react";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { ProjectLog } from "@/types/project.types";
import { CommitGraph } from "@/components/CommitGraph";
import { FileExplorer } from "@/components/FileExplorer/FileExplorer";
import { PluginSection } from "@/components/PluginSection/PluginSection";
import { PathSelectionModal } from "@/components/PathSelectionModal";
import { MergeModal } from "@/components/MergeModal/MergeModal";
import { ProjectSettings } from "@/components/ProjectSettings/ProjectSettings";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  Settings,
  Play,
  Pause,
  Rewind,
  ChevronLeft,
  GalleryHorizontalEnd,
} from "lucide-react";
import {
  WarningModal,
  shouldSkipWarning,
} from "@/components/WarningModal/WarningModal";
import { StorageWarningModal } from "../../components/ui/StorageWarningModal";
import logo from "@/assets/logo.png";
import logicLogo from "@/assets/logic_logo.png";
import abletonLogo from "@/assets/ableton_logo.png";
import flLogo from "@/assets/fl_logo.png";
import reaperLogo from "@/assets/reaper_logo.png";
import protoolsLogo from "@/assets/protools_logo.svg";
import { BranchMenu } from "@/components/BranchMenu/BranchMenu";
import "./History.css";
import { useUsername } from "@/hooks/useUsername";
export const History: React.FC = () => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const { username } = useUsername();
  const location = useLocation();
  const navigate = useNavigate();
  const passedProject = location.state?.projectName;
  const { projectId } = useParams();
  /** Version control log for the selected project (contains all branches and commits) */
  const [projectLog, setProjectLog] = useState<ProjectLog | null>(null);

  /** Currently selected branch (for highlighting in the graph) */
  const [selectedBranch, setSelectedBranch] = useState<string>("main");

  /** Track the latest request ID to prevent stale-response race conditions */
  const lastLogRequestIdRef = useRef<number>(0);

  /** Currently focused commit for preview/actions (independent of checkout) */
  const [focusedCommitId, setFocusedCommitId] = useState<string | null>(null);
  
  /** Mobile tab state for Files/Plugins toggle */
  const [activeMobileTab, setActiveMobileTab] = useState<"files" | "plugins">(
    "files",
  );

  /** Dropdown open/close state */
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  /** Controls whether the commit form is visible */
  const [isCreatingCommit, setIsCreatingCommit] = useState<boolean>(false);

  /** Commit message being typed */
  const [commitMessage, setCommitMessage] = useState<string>("");

  /** Controls whether the merge modal is visible */
  const [isMerging, setIsMerging] = useState<boolean>(false);

  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [branchError, setBranchError] = useState<string | null>(null);

  // Path Selection State
  const [showPathModal, setShowPathModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: "checkout" | "commit" | "branch";
    commitId?: string;
  } | null>(null);

  // Project Settings State
  const [showSettings, setShowSettings] = useState<boolean>(
    location.state?.openSettings === true,
  );

  // Back navigation: from project settings, step back to the project view;
  // otherwise return to the library (which restores the folder you came from).
  const handleBack = () => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    navigate("/");
  };

  // Unsaved Changes Warning State
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(
    null,
  );

  // Track if files have been modified since last commit (for status icons)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track which commit is currently being restored (for spinning animation)
  const [restoringCommitId, setRestoringCommitId] = useState<string | null>(
    null,
  );

  // Duplicate Commit Warning State
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // Committing State (for loading indicator)
  const [isCommitting, setIsCommitting] = useState(false);

  // Storage Warning State
  const [showStorageWarning, setShowStorageWarning] = useState(false);
  const [storageWarningMessage, setStorageWarningMessage] = useState("");

  // Delete Commit State
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [pendingDeleteCommitId, setPendingDeleteCommitId] = useState<
    string | null
  >(null);
  const [isDeletingCommit, setIsDeletingCommit] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Audio Preview state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressContainerRef = useRef<HTMLDivElement>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const pendingSeekRef = useRef<number | null>(null);

  /**
   * Handle file drop for audio preview
   */
  const performPreviewUpload = async (filePath: string) => {
    const targetCommitId = activeCommit?.commit_id;
    if (!targetCommitId) return;
    setIsUploadingPreview(true);
    try {
      const result = await window.ipcRenderer.invoke('add-preview-to-commit', passedProject, targetCommitId, filePath);
      if (result.success) {
        await refreshProjectLog();
      }
    } catch (error: any) {
      console.error("Failed to add preview:", error);
      alert(`Failed to add preview: ${error.message || error}`);
    } finally {
      setIsUploadingPreview(false);
    }
  };

  const handlePreviewDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const filePath = window.electronAPI.getPathForFile(file);

    if (!filePath) {
      console.error("No file path found on dropped file");
      return;
    }

    const targetCommitId = activeCommit?.commit_id;
    if (!targetCommitId) {
      alert("You must have a version checked out to add a preview to it.");
      return;
    }

    await performPreviewUpload(filePath);
  };

  const refreshProjectLog = async () => {
    if (!passedProject) return;
    const log = await window.ipcRenderer.invoke(
      "get-local-project-log",
      passedProject,
      projectId,
    );
    if (log) {
      setProjectLog(log);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = () => {
    setIsDraggingFile(false);
  };

  /** Memoized active commit and its version number */
  const activeCommit = useMemo(() => {
    if (!projectLog?.branches) return null;

    // Target commit logic:
    // 1. If user clicked a commit (focused), use that.
    // 2. Fallback to currently checked out commit.
    const targetId = focusedCommitId || projectLog.lastCheckout?.commitId;
    if (!targetId) return null;

    for (const branch of projectLog.branches) {
      const commit = branch.commits.find(
        (c) => String(c.commit_id) === String(targetId),
      );
      if (commit) return commit;
    }
    return null;
  }, [projectLog, focusedCommitId]);

  const versionNumber = useMemo(() => {
    if (!activeCommit || !projectLog?.branches) return null;
    const branch = projectLog.branches.find((b) => b.name === selectedBranch);
    if (!branch) return null;
    // Commits are chronological (oldest first in the array), so index + 1 works as version number
    const index = branch.commits.findIndex(
      (c) => String(c.commit_id) === String(activeCommit.commit_id),
    );
    return index !== -1 ? index + 1 : null;
  }, [activeCommit, projectLog, selectedBranch]);

  // Track progress via onTimeUpdate
  const onAudioTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    const progress = (audio.currentTime / audio.duration) * 100;

    // Low-frequency logging to avoid console spam
    if (Math.floor(audio.currentTime) % 2 === 0 && audio.currentTime > 0) {
      console.log(
        `[Audio Debug] Time: ${audio.currentTime.toFixed(2)}s / ${audio.duration.toFixed(2)}s (${progress.toFixed(1)}%)`,
      );
    }

    if (audio.currentTime > 0 && !isDraggingProgress) {
      setCurrentTime(audio.currentTime);
    }
    if (audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
      setDuration(audio.duration);
    }
  };

  const onAudioLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    if (audio.duration && audio.duration > 0 && audio.duration !== Infinity) {
      setDuration(audio.duration);
    }
    if (pendingSeekRef.current !== null) {
      audio.currentTime = pendingSeekRef.current;
      setCurrentTime(pendingSeekRef.current);
      pendingSeekRef.current = null;
    }
  };

  const onAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Handle Rewind (Back 10s)
  const handleRewind = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  // Handle Play/Pause
  const [audioUrl, setAudioUrl] = useState<string>("");

  const handleTogglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeCommit?.preview_file) return;

    if (!isPlaying) {
      if (!audioUrl) {
        const url = await window.ipcRenderer.invoke(
          "get-preview-url",
          passedProject,
          activeCommit.commit_id,
          activeCommit.preview_file,
        );
        setAudioUrl(url);
        setIsPlaying(true);
      } else if (audioRef.current) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Sync isPlaying state with audio element
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && audioUrl) {
        audioRef.current
          .play()
          .catch((e) => console.error("Audio play failed:", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [audioUrl, isPlaying]);

  // Cleanup/Reset audio on commit change
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioUrl("");
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [activeCommit?.commit_id]);

  const handleProgressClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || duration === 0) return;

    const rect = progressContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressMouseDown = (e: React.MouseEvent) => {
    setIsDraggingProgress(true);
    handleProgressClick(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingProgress || !audioRef.current || duration === 0) return;

      const rect = progressContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      let clickX = e.clientX - rect.left;
      clickX = Math.max(0, Math.min(clickX, rect.width));
      const newTime = (clickX / rect.width) * duration;

      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    };

    const handleMouseUp = () => {
      setIsDraggingProgress(false);
    };

    if (isDraggingProgress) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingProgress, duration]);

  const [pendingCheckoutStorageId, setPendingCheckoutStorageId] = useState<
    string | null
  >(null);

  // Project path from registry (single source of truth)
  const [projectPath, setProjectPath] = useState<string | null>(null);

  // ============================================================================
  // LIFECYCLE EFFECTS
  // ============================================================================

  /**
   * When a project is selected: load its version control log from disk.
   * Falls back to registry-based lookup if no local log file is found yet
   * (e.g. right after init, before the log file has been written).
   */
  useEffect(() => {
    if (!passedProject) return;

    const loadAndSync = async () => {
      const requestId = ++lastLogRequestIdRef.current;

      const localLog = await window.ipcRenderer.invoke('get-local-project-log', passedProject, projectId);

      if (requestId === lastLogRequestIdRef.current && localLog) {
        setProjectLog(localLog);
        setSelectedBranch(localLog.current_branch || "main");
        return;
      }

      if (!localLog) {
        setIsSyncing(true);
        const log = await window.ipcRenderer.invoke('get-project-log', passedProject, projectId);
        setIsSyncing(false);

        if (requestId === lastLogRequestIdRef.current && log) {
          setProjectLog(log);
          setSelectedBranch(log.current_branch || 'main');
        }
      }
    };

    loadAndSync();
  }, [passedProject, projectId]);

  /**
   * Fetch project path from registry whenever project log changes
   * Registry is the single source of truth for project paths
   */
  useEffect(() => {
    const fetchProjectPath = async () => {
      if (!projectLog || Object.keys(projectLog).length === 0) {
        setProjectPath(null);
        return;
      }

      try {
        const path = await window.ipcRenderer.invoke(
          "get-project-path",
          projectLog.name,
          projectLog.id,
        );
        setProjectPath(path);

        // Auto-prompt path selection if it's missing
        if (!path || path === 'NA' || path === '/') {
          console.log('[History] Project path is NA, showing path modal automatically');
          // Set no pending action so it just updates the path
          setPendingAction(null);
          setShowPathModal(true);
        }
      } catch (error) {
        console.error("[History] Error fetching project path:", error);
        setProjectPath(null);
      }
    };

    fetchProjectPath();
  }, [projectLog]);

  /**
   * Check for unsaved changes when project log loads or branch changes
   * Uses lastCheckout timestamp from log to determine if files were modified
   */
  useEffect(() => {
    const checkForUnsavedChanges = async () => {
      console.log("[hasUnsavedChanges] Starting check...");

      // If path is NA, the project hasn't been downloaded locally yet
      // Skip the unsaved changes check - the blue state will be shown based on no lastCheckout
      if (projectPath === "NA" || !projectPath || projectPath === "/") {
        console.log(
          "[hasUnsavedChanges] No valid project path, skipping check",
        );
        setHasUnsavedChanges(false);
        return;
      }

      // Check if projectLog exists
      if (!projectLog) {
        console.log("[hasUnsavedChanges] No project log, setting false");
        setHasUnsavedChanges(false);
        return;
      }

      // If no lastCheckout info, skip the check (will show blue state)
      if (!projectLog.lastCheckout) {
        console.log("[hasUnsavedChanges] No lastCheckout info, setting false");
        setHasUnsavedChanges(false);
        return;
      }

      console.log("[hasUnsavedChanges] lastCheckout:", projectLog.lastCheckout);

      try {
        const result = await window.ipcRenderer.invoke(
          "get-project-last-save-time",
          projectPath,
        );
        console.log("[hasUnsavedChanges] File save time result:", result);

        if (result.success) {
          const fileModTime = result.latestModTime;

          // Parse lastCheckout timestamp (YYYYMMDDHHmmss) as UTC
          const ts = projectLog.lastCheckout.timestamp;
          const year = ts.slice(0, 4);
          const month = ts.slice(4, 6);
          const day = ts.slice(6, 8);
          const hour = ts.slice(8, 10);
          const min = ts.slice(10, 12);
          const sec = ts.slice(12, 14);
          // Add 'Z' to parse as UTC (backend saves in UTC via toISOString)
          const checkoutTime = new Date(
            `${year}-${month}-${day}T${hour}:${min}:${sec}Z`,
          ).getTime();

          console.log(
            "[hasUnsavedChanges] File mod time:",
            new Date(fileModTime).toISOString(),
          );
          console.log(
            "[hasUnsavedChanges] Latest modified file:",
            result.latestFilePath,
          );
          console.log(
            "[hasUnsavedChanges] Checkout time:",
            new Date(checkoutTime).toISOString(),
          );
          console.log(
            "[hasUnsavedChanges] Time diff (ms):",
            fileModTime - checkoutTime,
          );
          console.log("[hasUnsavedChanges] Buffer threshold: 5000ms");

          // Files modified more than 5 seconds after checkout = unsaved changes
          // 5 second buffer accounts for the rollback operation writing files
          const hasChanges = fileModTime > checkoutTime + 5000;
          console.log(
            "[hasUnsavedChanges] Setting hasUnsavedChanges to:",
            hasChanges,
          );
          setHasUnsavedChanges(hasChanges);
        } else {
          console.log(
            "[hasUnsavedChanges] File save time check failed, setting false",
          );
          setHasUnsavedChanges(false);
        }
      } catch (error) {
        console.warn(
          "[hasUnsavedChanges] Error checking for unsaved changes:",
          error,
        );
        setHasUnsavedChanges(false);
      }
    };

    checkForUnsavedChanges();
  }, [projectLog, projectPath]);

  /**
   * Re-check for unsaved changes when window gains focus
   * This triggers when user returns to DAWLab from their DAW
   */
  useEffect(() => {
    const handleWindowFocus = () => {
      // Trigger a re-check by updating projectLog reference
      if (projectLog) {
        setProjectLog({ ...projectLog });
      }
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [projectLog]);

  /**
   * Auto-draft watching: while this project is open, the main process watches
   * its folder and snapshots unsaved DAW saves into an unnamed draft (kept out
   * of history until the user names it). Restart on branch change so drafts are
   * captured against the branch the user is on.
   */
  useEffect(() => {
    if (!passedProject || !projectPath || projectPath === "/" || projectPath === "NA") {
      return;
    }

    window.ipcRenderer
      .invoke("start-draft-watch", passedProject, projectPath, selectedBranch || "main", username || "")
      .catch((err) => console.warn("[History] Failed to start draft watch:", err));

    return () => {
      window.ipcRenderer
        .invoke("stop-draft-watch", passedProject)
        .catch((err) => console.warn("[History] Failed to stop draft watch:", err));
    };
  }, [passedProject, projectPath, selectedBranch, username]);

  /**
   * Keyboard shortcuts
   * Cmd+K (or Ctrl+K) to open branch selector
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsDropdownOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /**
   * Reloads the project log (for use after commits, etc.)
   */
  const loadProjectLog = async (projectName: string) => {
    const requestId = ++lastLogRequestIdRef.current;

    try {
      const isLocalId = !projectId || projectId.startsWith('local:');
      
      setIsSyncing(true);
      const log = await window.ipcRenderer.invoke('get-project-log', projectName, isLocalId ? undefined : projectId);
      
      // Only apply update if this is still the most recent request
      if (requestId === lastLogRequestIdRef.current) {
        setProjectLog(log);
        setSelectedBranch(log.current_branch || "main");
      } else {
        console.warn(
          `[History] Ignoring stale log data for ${projectName} (newer request exists)`,
        );
      }
    } catch (error) {
      if (requestId === lastLogRequestIdRef.current) {
        console.error("Error loading project log:", error);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Performs the actual rollback to a commit
   */
  const performCheckout = async (commitId: string, bypassLimit = false) => {
    if (!projectLog) return;
    console.log(
      "Rollback project:",
      passedProject,
      "to commit:",
      commitId,
      "bypassLimit:",
      bypassLimit,
    );

    // Set restoring state to show spinning animation
    setRestoringCommitId(commitId);

    try {
      const result = await window.ipcRenderer.invoke(
        "rollback-project",
        passedProject,
        commitId,
        bypassLimit,
      );
      console.log("Project rolled back:", result);
      // Reload project log to get updated lastCheckout
      await loadProjectLog(passedProject);
    } catch (error: any) {
      console.error("Error during rollback:", error);
      const errorMessage = error?.message || String(error);

      if (errorMessage.includes("Storage limit exceeded")) {
        setStorageWarningMessage(
          "You've reached your local storage limit. You can adjust this in Settings.",
        );
        setPendingCheckoutStorageId(commitId);
        setShowStorageWarning(true);
      } else {
        alert(`Failed to restore version: ${errorMessage}`);
      }
    } finally {
      // Clear restoring state
      setRestoringCommitId(null);
    }
  };

  /**
   * Handles checking out (reverting to) a specific commit
   * Now includes check for unsaved changes before proceeding
   */
  const handleCheckout = async (commitId: string) => {
    console.log("Checkout commit:", commitId);

    if (!projectLog) return;

    // Check if we need to select a path first
    if (!projectPath || projectPath === "NA") {
      console.log(
        "Project path is missing, prompting for path selection",
      );
      setPendingAction({ type: "checkout", commitId });
      setShowPathModal(true);
      return;
    }

    // Check for unsaved changes (skip if user opted out)
    const skipUnsavedWarning = await shouldSkipWarning('unsaved-changes');
    


    if (!skipUnsavedWarning) {
      try {
        // Only check if we have lastCheckout info
        if (projectLog.lastCheckout) {
          const saveTimeResult = await window.ipcRenderer.invoke(
            "get-project-last-save-time",
            projectPath,
          );

          if (saveTimeResult.success) {
            const fileModTime = saveTimeResult.latestModTime;

            // Parse lastCheckout timestamp as UTC
            const ts = projectLog.lastCheckout.timestamp;
            const year = ts.slice(0, 4);
            const month = ts.slice(4, 6);
            const day = ts.slice(6, 8);
            const hour = ts.slice(8, 10);
            const min = ts.slice(10, 12);
            const sec = ts.slice(12, 14);
            const checkoutTime = new Date(
              `${year}-${month}-${day}T${hour}:${min}:${sec}Z`,
            ).getTime();

            console.log(
              "[handleCheckout] File mod time:",
              new Date(fileModTime).toISOString(),
            );
            console.log(
              "[handleCheckout] Checkout time:",
              new Date(checkoutTime).toISOString(),
            );

            // If files were modified after the last checkout (with 5s buffer), show warning
            if (fileModTime > checkoutTime + 5000) {
              console.log(
                "[handleCheckout] Unsaved changes detected, showing warning",
              );
              setPendingCheckoutId(commitId);
              setShowUnsavedWarning(true);
              return;
            }
          }
        }
      } catch (error) {
        console.warn(
          "[handleCheckout] Error checking for unsaved changes:",
          error,
        );
        // Continue with checkout if we can't check
      }
    }

    // No unsaved changes or user skipped warning - proceed with checkout
    await performCheckout(commitId);
  };

  /**
   * Handle proceeding with checkout despite unsaved changes
   */
  const handleProceedAnyway = async () => {
    setShowUnsavedWarning(false);
    if (pendingCheckoutId) {
      await performCheckout(pendingCheckoutId);
      setPendingCheckoutId(null);
    }
  };

  /**
   * Handle committing changes before checkout
   */
  const handleCommitFirst = () => {
    setShowUnsavedWarning(false);
    setIsCreatingCommit(true);
    // pendingCheckoutId is kept so user can checkout after committing
  };

  /* Removed stray braces */

  const handleProceedCheckoutAnyway = async () => {
    setShowStorageWarning(false);
    if (pendingCheckoutStorageId) {
      // If we had a pending checkout blocked by storage, we still need to check for unsaved changes
      const commitId = pendingCheckoutStorageId;
      setPendingCheckoutStorageId(null);

      // Check for unsaved changes (copied logic from handleCheckout)
      const skipUnsavedWarning = await shouldSkipWarning("unsaved-changes");
      if (!skipUnsavedWarning) {
        try {
          if (projectLog?.lastCheckout) {
            const saveTimeResult = await window.ipcRenderer.invoke(
              "get-project-last-save-time",
              projectPath,
            );
            if (saveTimeResult.success) {
              const fileModTime = saveTimeResult.latestModTime;
              const ts = projectLog.lastCheckout.timestamp;
              const year = ts.slice(0, 4);
              const month = ts.slice(4, 6);
              const day = ts.slice(6, 8);
              const hour = ts.slice(8, 10);
              const min = ts.slice(10, 12);
              const sec = ts.slice(12, 14);
              const checkoutTime = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`).getTime();
              
              if (fileModTime > checkoutTime + 5000) {
                setPendingCheckoutId(commitId);
                setShowUnsavedWarning(true);
                return;
              }
            }
          }
        } catch (error) {
          console.warn(
            "[handleProceedCheckoutAnyway] Error checking unsaved changes:",
            error,
          );
        }
      }

      await performCheckout(commitId, true);
    }
  };

  /**
   * Handle canceling checkout
   */
  const handleCancelCheckout = () => {
    setShowUnsavedWarning(false);
    setPendingCheckoutId(null);
  };

  /**
   * Handles saving a new commit
   * Calls the IPC method to commit the project
   */
  const handleSaveCommit = async (customMessage?: string) => {
    const messageToUse = customMessage || commitMessage;
    if (!messageToUse.trim()) {
      alert("Please enter some version notes");
      return;
    }

    console.log("Project Log:", projectLog);
    if (!projectLog) return;
    if (!projectPath || projectPath === "/") {
      console.log(
        "Project path is missing, prompting for path selection",
      );
      setPendingAction({ type: "commit" });
      setShowPathModal(true);
      return;
    }

    await performCommit(messageToUse);
  };

  /**
   * Actually performs the commit operation
   */
  const performCommit = async (messageOverride?: string) => {
    if (!projectLog) return;

    setIsCommitting(true);
    try {
      const res = await window.ipcRenderer.invoke(
        "commit-project",
        passedProject,
        messageOverride || commitMessage,
        selectedBranch,
        username || "",
      );
      console.log("Commit created:", res);

      // Reset form
      setCommitMessage("");
      setIsCreatingCommit(false);

      // Reload the project log to show the new commit
      await loadProjectLog(passedProject);
    } catch (error: any) {
      console.error('Error creating commit:', error);
      
      // Check for storage limit exceeded error
      const errorMessage = error?.message || String(error);
      if (
        errorMessage.includes("Storage limit exceeded") ||
        errorMessage.includes("403")
      ) {
        setStorageWarningMessage(
          "You've reached your local storage limit. You can adjust this in Settings.",
        );
        setShowStorageWarning(true);
      } else {
        alert(`Failed to create commit: ${errorMessage}`);
      }
    } finally {
      setIsCommitting(false);
    }
  };

  /**
   * Handle proceeding with duplicate commit anyway - open the commit form
   */
  const handleDuplicateCommitAnyway = () => {
    setShowDuplicateWarning(false);
    setIsCreatingCommit(true);
  };

  /**
   * Handle canceling duplicate commit
   */
  const handleCancelDuplicateCommit = () => {
    setShowDuplicateWarning(false);
  };

  /**
   * Handle clicking the Save button in the header
   * Shows warning if no changes detected, otherwise opens commit form
   */
  const handleSaveButtonClick = async () => {
    console.log('[handleSaveButtonClick] Called');
    console.log('[handleSaveButtonClick] hasUnsavedChanges:', hasUnsavedChanges);
    
    // Check if we need to select a path first
    if (!projectPath || projectPath === "/" || projectPath === "NA") {
      console.log(
        "Project path is missing, prompting for path selection",
      );
      setPendingAction({ type: "commit" });
      setShowPathModal(true);
      return;
    }
    
    const skipDuplicateWarning = await shouldSkipWarning('duplicate-commit');
    console.log('[handleSaveButtonClick] skipDuplicateWarning:', skipDuplicateWarning);
    console.log('[handleSaveButtonClick] Condition (!hasUnsavedChanges && !skipDuplicateWarning):', !hasUnsavedChanges && !skipDuplicateWarning);
    
    if (!hasUnsavedChanges && !skipDuplicateWarning) {
      console.log(
        "[handleSaveButtonClick] No changes detected, showing duplicate warning",
      );
      setShowDuplicateWarning(true);
      console.log(
        "[handleSaveButtonClick] setShowDuplicateWarning(true) called",
      );
      return;
    }
    console.log("[handleSaveButtonClick] Opening commit form directly");
    setIsCreatingCommit(true);
  };

  const handleIconDoubleClick = async () => {
    if (!projectLog) return;
    if (!projectPath || projectPath === "/") {
      console.log(
        "Project path is missing, prompting for path selection",
      );
      setPendingAction({ type: "checkout" });
      setShowPathModal(true);
      return;
    }
    try {
      const result = await window.ipcRenderer.invoke(
        "open-project",
        projectPath,
      );
      console.log("Open project result:", result);
      if (!result.success) {
        alert(`Failed to open project: ${result.error}`);
      }
    } catch (error) {
      console.error("Error opening project:", error);
      alert("Failed to open project");
    }
  };

  /**
   * Handle delete commit request - show confirmation modal
   */
  const handleDeleteCommitRequest = (commitId: string) => {
    console.log(
      "[handleDeleteCommitRequest] Requesting delete for commit:",
      commitId,
    );
    setPendingDeleteCommitId(commitId);
    setShowDeleteConfirmation(true);
  };

  /**
   * Perform the actual commit deletion (works both with and without confirmation)
   */
  const handleConfirmDeleteCommit = async (commitIdOverride?: string) => {
    const commitId = commitIdOverride || pendingDeleteCommitId;
    if (!commitId || !passedProject || !projectLog) return;

    setIsDeletingCommit(true);
    try {
      console.log('[handleConfirmDeleteCommit] Deleting commit:', commitId);

      const result = await window.ipcRenderer.invoke(
        "delete-commit",
        commitId,
        passedProject,
      );

      if (result.success) {
        console.log(
          "[handleConfirmDeleteCommit] Commit deleted, files removed:",
          result.files_deleted || 0,
        );
        await loadProjectLog(passedProject);
      } else {
        alert(`Failed to delete version: ${result.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("[handleConfirmDeleteCommit] Error:", error);
      alert(`Failed to delete version: ${error?.message || "Unknown error"}`);
    } finally {
      setIsDeletingCommit(false);
      setShowDeleteConfirmation(false);
      setPendingDeleteCommitId(null);
    }
  };

  /**
   * Cancel commit deletion
   */
  const handleCancelDeleteCommit = () => {
    setShowDeleteConfirmation(false);
    setPendingDeleteCommitId(null);
  };

  // ============================================================================
  // LOADING STATES
  // ============================================================================

  if (!projectLog) {
    return (
      <div className="history-page history-loading-container">
        <div className="history-loading-content">
          <div className="history-loading-spinner" />
          <div className="history-loading-text">Loading project...</div>
        </div>
      </div>
    );
  }

  if (!projectLog.branches) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-400">
        <div className="text-xl mb-4">Oops, this project doesn't exist</div>
        <Link
          to="/"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Go back to Library
        </Link>
      </div>
    );
  }

  // ============================================================================
  // DATA PREPARATION
  // ============================================================================

  const handleCreateBranch = async (name?: string) => {
    const branchToCreate = name || newBranchName;
    if (!passedProject || !branchToCreate.trim()) {
      console.warn("No project selected or branch name is empty");
      return;
    }

    if (!projectLog) return;

    // Check if we need to select a path first
    if (!projectPath || projectPath === "/") {
      console.log(
        "Project path is missing, prompting for path selection",
      );
      setPendingAction({ type: "branch" });
      setShowPathModal(true);
      return;
    }

    try {
      setIsCreatingBranch(true);
      setBranchError(null);
      const branchNameTrimmed = branchToCreate.trim();
      const createResult = await window.ipcRenderer.invoke(
        "create-branch",
        passedProject,
        branchNameTrimmed,
        undefined,
        username || "",
      );
      if (!createResult.success) {
        console.error("Failed to create branch:", createResult);
        setBranchError("Failed to create branch");
        return;
      }
      await window.ipcRenderer.invoke(
        "switch-branch",
        passedProject,
        branchNameTrimmed,
      );

      await loadProjectLog(passedProject);
      setSelectedBranch(branchNameTrimmed);
      setNewBranchName("");
      setIsDropdownOpen(false);
      setFocusedCommitId(null); // Reset focus on branch switch

      console.log(`Created and switched to ${branchNameTrimmed}`);
    } catch (err: any) {
      console.error("Branch creation error:", err);
      setBranchError(err?.message || "Failed to create branch");
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    if (!passedProject) {
      console.warn("No project selected");
      return;
    }

    try {
      // Increment request ID to cancel any pending background log refreshes
      lastLogRequestIdRef.current++;

      // Optimistic UI: Close immediately and update local state
      setIsDropdownOpen(false);
      setSelectedBranch(branchName);
      setFocusedCommitId(null);
      
      const result = await window.ipcRenderer.invoke('switch-branch', passedProject, branchName, projectId);
      
      if (result.success && result.log) {
        setProjectLog(result.log);
      }

      // Background log refresh (UI is already updated optimistically)
      loadProjectLog(passedProject);

      console.log(`Switched to ${branchName}`);
    } catch (err) {
      console.error("Branch switch error:", err);
    }
  };

  // Handler for creating a branch from a specific commit (context menu action)
  const handleBranchFromCommit = async (
    branchName: string,
    fromCommitId: string,
  ) => {
    if (!passedProject || !projectLog) {
      console.error("[History] Cannot create branch: missing project or log");
      throw new Error("Project information not available");
    }

    console.log("[History] Creating branch from commit:", {
      branchName,
      fromCommitId,
    });

    // Check if we need to select a path first
    if (!projectPath || projectPath === "/") {
      console.log(
        "[History] Project path is missing, prompting for path selection",
      );
      throw new Error("Please set a project path first");
    }

    try {
      const author = username || "";

      console.log("[History] Calling create-branch IPC:", {
        project: passedProject,
        branch: branchName,
        fromCommit: fromCommitId,
        author,
      });

      const result = await window.ipcRenderer.invoke(
        "create-branch",
        passedProject,
        branchName,
        fromCommitId, // This is the key parameter - creates branch from this commit
        author,
      );

      if (!result.success) {
        console.error("[History] Branch creation failed:", result);
        throw new Error(result.error || "Failed to create branch");
      }

      console.log('[History] Branch created successfully, reloading project log');
      
      // Reload the project log to show the new branch
      await loadProjectLog(passedProject);

      // Optionally switch to the new branch
      setSelectedBranch(branchName);

      console.log(
        `[History] Created branch "${branchName}" from commit ${fromCommitId}`,
      );
    } catch (err: any) {
      console.error("[History] Error creating branch from commit:", err);
      throw err; // Re-throw so CommitGraph can handle the error
    }
  };

  const handleConfirmPath = async (
    path: string,
    setLoading: (loading: boolean) => void,
  ) => {
    console.log("clone-project", passedProject, path);
    try {
      // Use the unified update-project-path handler which handles both owned and shared projects
      const fullPath = path + "/" + passedProject;
      await window.ipcRenderer.invoke(
        "update-project-path",
        projectId || passedProject,
        fullPath,
      );
      await loadProjectLog(passedProject);

      if (pendingAction && pendingAction.type === "checkout") {
        console.log(
          `Would checkout commit ${pendingAction.commitId} to ${path}`,
        );
        await window.ipcRenderer.invoke(
          "rollback-project",
          passedProject,
          pendingAction.commitId,
        );
      }

      if (pendingAction && pendingAction.type === "commit") {
        console.log("Continuing with commit after path selection");
        // Re-trigger commit save
        if (commitMessage.trim()) {
          try {
            const res = await window.ipcRenderer.invoke(
              "commit-project",
              passedProject,
              commitMessage,
              selectedBranch,
              username || "",
            );
            console.log("Commit created:", res);
            setCommitMessage("");
            setIsCreatingCommit(false);
            await loadProjectLog(passedProject);
          } catch (error: any) {
            console.error("Error creating commit:", error);
            const errorMessage = error?.message || String(error);
            if (
              errorMessage.includes("Storage limit exceeded") ||
              errorMessage.includes("403")
            ) {
              setStorageWarningMessage(
                "You don't have enough storage space for this action.",
              );
              setShowStorageWarning(true);
            } else {
              alert(`Failed to create commit: ${errorMessage}`);
            }
          }
        }
      }

      if (pendingAction && pendingAction.type === "branch") {
        console.log("Continuing with branch creation after path selection");
        // Re-trigger branch creation
        if (newBranchName.trim() && projectLog) {
          try {
            setIsCreatingBranch(true);
            // fromCommit is not used here - we just commit current files
            const createResult = await window.ipcRenderer.invoke(
              "create-branch",
              passedProject,
              newBranchName.trim(),
              undefined,
              username || "",
            );

            if (!createResult.success) {
              console.error("Failed to create branch:", createResult);
              alert("Failed to create branch");
              return;
            }
            await window.ipcRenderer.invoke(
              "switch-branch",
              passedProject,
              newBranchName.trim(),
            );
            await loadProjectLog(passedProject);
            setSelectedBranch(newBranchName.trim());
            setNewBranchName("");
            setIsDropdownOpen(false);
            console.log(`Created and switched to ${newBranchName.trim()}`);
          } catch (err) {
            console.error("Branch creation error:", err);
          } finally {
            setIsCreatingBranch(false);
          }
        }
      }

      setShowPathModal(false);
      setPendingAction(null);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="history-page px-6 pt-2 pb-6">
      {/* Page Title */}

      {/* Header Bar */}
      {/* breadcrumb added again */}
      {/* Header Bar */}
      {/* Header Bar */}
      {/* Header Bar */}
      <div className="px-6 py-2 mb-2 relative z-10 bg-transparent flex flex-col min-[900px]:flex-row items-center gap-4 min-[900px]:gap-0 min-[900px]:justify-between">
        {/* Left: Back + Logo + Project Name */}
        <div className="flex items-center gap-4 shrink-0 flex-1 min-w-[200px] justify-center min-[900px]:justify-start w-full min-[900px]:w-auto">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity no-underline text-white bg-transparent border-0 p-0 cursor-pointer"
          >
            <ChevronLeft size={24} className="text-gray-400" />
            <img src={logo} alt="DAWLab" className="w-8 h-8 rounded-lg" />
          </button>
          <div className="flex flex-col">
            <h2 className="flex items-center m-0 leading-tight">
              <span className="text-white text-xl font-bold">
                {passedProject || "Project Name"}
              </span>
              <span className="text-[#444] mx-2 text-xl font-normal">/</span>
              <span className="text-gray-400 text-base font-medium mt-1">
                {selectedBranch || 'main'}
              </span>
            </h2>
          </div>
          {isSyncing && <div className="background-sync-spinner" />}
        </div>

        {/* Center: Project Alternatives (Branch Selector) */}
        {!showSettings && (
          <div className="flex justify-center flex-1 w-full min-[900px]:w-auto">
            <div className="relative">
              <div
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="bg-[#1C1C1C] text-white px-8 h-[48px] rounded-[15px] flex items-center gap-2 cursor-pointer border border-transparent hover:border-gray-600 transition-all shadow-sm text-md font-medium"
              >
                <GalleryHorizontalEnd size={18} />
                <span>Project Alternatives</span>
              </div>

              {/* Branch Menu */}
              {isDropdownOpen && (
                <BranchMenu
                  branches={projectLog.branches}
                  selectedBranch={selectedBranch}
                  onSwitchBranch={handleSwitchBranch}
                  onCreateBranch={(name) => {
                    setIsCreatingCommit(false);
                    handleCreateBranch(name);
                  }}
                  onClose={() => setIsDropdownOpen(false)}
                  error={branchError}
                  isCreating={isCreatingBranch}
                />
              )}
            </div>
          </div>
        )}

        {/* Right Side: Action Buttons */}
        <div className="flex gap-3 justify-center min-[900px]:justify-end shrink-0 items-center flex-1 min-w-[200px] w-full min-[900px]:w-auto">
          {!showSettings && (
            <>
              <ActionButton
                variant="save"
                onClick={handleSaveButtonClick}
                className="btn-pill"
              >
                Save
              </ActionButton>
              <button
                className="btn-pill group"
                onClick={handleIconDoubleClick}
                title="Open in DAW"
              >
                <span className="text-gray-400 group-hover:text-white">
                  Open
                </span>
                {(() => {
                  const dawLower = projectLog.daw?.toLowerCase();
                  if (
                    dawLower === "logic" ||
                    dawLower === "logic pro" ||
                    dawLower === "logic pro x"
                  ) {
                    return (
                      <img
                        src={logicLogo}
                        alt="Logic Pro"
                        className="w-[18px] h-[18px] object-contain"
                      />
                    );
                  } else if (
                    dawLower === "ableton" ||
                    dawLower === "ableton live"
                  ) {
                    return (
                      <img
                        src={abletonLogo}
                        alt="Ableton Live"
                        className="w-[18px] h-[18px] object-contain"
                      />
                    );
                  } else if (dawLower === "fl" || dawLower === "fl studio") {
                    return (
                      <img
                        src={flLogo}
                        alt="FL Studio"
                        className="w-[18px] h-[18px] object-contain"
                      />
                    );
                  } else if (dawLower === "reaper") {
                    return (
                      <img
                        src={reaperLogo}
                        alt="Reaper"
                        className="w-[18px] h-[18px] object-contain"
                      />
                    );
                  } else if (dawLower === "pro tools") {
                    return (
                      <img
                        src={protoolsLogo}
                        alt="Pro Tools"
                        className="w-[18px] h-[18px] object-contain"
                      />
                    );
                  }
                  return null;
                })()}
              </button>
            </>
          )}

          {/* Settings button */}
          <button
            className="btn-pill-icon"
            onClick={() => setShowSettings(!showSettings)}
            title={showSettings ? "Back to Project" : "Project Settings"}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
      {/* **How this works:**

        1. **`flex-wrap`** - Allows items to wrap to new lines
        2. **`min-w-[200px]`** on left and right - Forces them to wrap when they can't fit
        3. **`flex-1`** on left and right - Makes them grow to fill space
        4. **`flex-shrink-0`** on center - Prevents the dropdown from shrinking
        5. **`gap-4`** - Adds consistent spacing between all items

        **The progressive behavior:**

        - **Wide screen**: All three in one row: `[Left -------- Center -------- Right]`
        - **Medium screen** (left gets too squished): Left wraps to top, center and right stay together:
        ```
          [Left breadcrumb takes full width]
          [        Center        Right]
        ```
        - **Small screen** (all items can't fit): Everything stacks:
        ```
          [Left breadcrumb]
          [Center dropdown]
          [Right buttons] */}

      {/* Conditional: Show either Project Settings or Commit Graph */}
      {showSettings ? (
        <ProjectSettings
          projectId={projectId || ""}
          projectName={passedProject || "Project"}
          onBack={() => setShowSettings(false)}
        />
      ) : (
        <>
          {/* ===== COMMIT GRAPH SECTION ===== */}

          {(() => {
            const currentBranch = projectLog.branches.find(
              (b) => b.name === selectedBranch,
            );
            const commits = currentBranch?.commits || [];

            return commits.length > 0 ? (
              <CommitGraph
                commits={commits}
                onCheckout={handleCheckout}
                onDeleteCommit={handleDeleteCommitRequest}
                onBranchCreate={handleBranchFromCommit}
                currentCommitId={projectLog.lastCheckout?.commitId}
                selectedCommitId={focusedCommitId}
                onCommitSelect={setFocusedCommitId}
                lastCheckoutTimestamp={projectLog.lastCheckout?.timestamp}
                hasUnsavedChanges={hasUnsavedChanges}
                restoringCommitId={restoringCommitId}
                projectName={passedProject}
                projectId={projectId || ""}
                currentBranch={selectedBranch}
                onSaveCommit={handleSaveCommit}
                onCancelSave={() => {
                  setIsCreatingCommit(false);
                  setCommitMessage("");
                }}
                isCommitting={isCommitting}
                isCreatingCommit={isCreatingCommit}
              />
            ) : (
              <div className="text-white text-center py-10">
                {isCreatingBranch
                  ? "Loading branch..."
                  : "No versions in this branch"}
              </div>
            );
          })()}
        </>
      )}

      {/* File Explorer + Plugin Section side-by-side (Desktop) / Tabbed (Mobile) */}
      {!showSettings && projectLog && (
        <div className="flex flex-col flex-1 min-h-0 px-6">
          {/* Tab Picker (Visible only below 900px) */}
          <div className="mb-8 min-[900px]:hidden">
            <div className="flex gap-8 relative">
              <button
                onClick={() => setActiveMobileTab('files')}
                className={`pb-4 text-base font-medium transition-colors relative z-10 !bg-transparent !border-none !p-0 !rounded-none ${
                  activeMobileTab === 'files' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Files
                {activeMobileTab === "files" && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0094FF] shadow-[0_0_8px_rgba(0,148,255,0.5)]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
              <button
                onClick={() => setActiveMobileTab('plugins')}
                className={`pb-4 text-base font-medium transition-colors relative z-10 !bg-transparent !border-none !p-0 !rounded-none ${
                  activeMobileTab === 'plugins' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Plugins
                {activeMobileTab === "plugins" && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0094FF] shadow-[0_0_8px_rgba(0,148,255,0.5)]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            </div>
          </div>

          <div className="bottom-panels flex flex-col min-[900px]:flex-row gap-8 flex-1 min-h-0">
            {/* File Explorer Section */}
            <div
              className={`
              flex-1 min-h-0 
              ${activeMobileTab === "files" ? "flex flex-col" : "hidden"} 
              min-[900px]:flex min-[900px]:flex-col
              overflow-y-auto
            `}>
              <FileExplorer 
                projectName={passedProject}
                commitId={
                  activeCommit?.commit_id || projectLog.lastCheckout?.commitId
                }
                projectPath={projectPath}
                onSelectPath={() => setShowPathModal(true)}
              />
            </div>

            {/* Plugin Section */}
            <div
              className={`
              flex-1 min-h-0
              ${activeMobileTab === "plugins" ? "flex flex-col" : "hidden"}
              min-[900px]:flex min-[900px]:flex-col
              overflow-y-auto
            `}
            >
              <PluginSection
                plugins={(projectLog as any).metadata?.plugins || []}
              />
            </div>

          </div>
        </div>
      )}

      {/* Global Preview Dropzone at the bottom - Hidden in settings view */}
      {!showSettings && (
        <>
          <div className={`preview-dropzone-container ${isDraggingFile ? 'dragging' : ''} ${isUploadingPreview ? 'uploading' : ''} ${activeCommit?.preview_file ? 'has-preview' : ''}`}>
            <div
              className="preview-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handlePreviewDrop}
              onClick={(e) => {
                // Only toggle if we have a preview file and we're not dragging
                if (activeCommit?.preview_file && !isDraggingFile) {
                  handleTogglePlay(e);
                }
              }}
            >
              {isUploadingPreview ? (
                <span className="preview-uploading-label">Attaching preview...</span>
              ) : activeCommit?.preview_file && !isDraggingFile ? (
                <div className="preview-player-container">
                  <div className="preview-player-content">
                    <div className="player-controls">
                      <button
                        className="play-icon-container rewind-btn"
                        onClick={handleRewind}
                        title="Rewind 10s"
                      >
                        <Rewind size={20} strokeWidth={1.5} />
                      </button>
                      <button
                        className="play-icon-container"
                        onClick={handleTogglePlay}
                      >
                        {isPlaying ? (
                          <Pause size={24} strokeWidth={1.5} />
                        ) : (
                          <Play size={24} strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                    <div className="player-info">
                      <span className="version-label">
                        Version {versionNumber}
                      </span>
                      <span className="commit-message-preview">
                        {activeCommit.message}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <span>
                  {isDraggingFile
                    ? "Drop to attach preview"
                    : "Drag and drop audio file for preview"}
                </span>
              )}
            </div>
          </div>

          {/* Audio Progress Bar and Element */}
          {activeCommit?.preview_file && (
            <>
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="auto"
                onTimeUpdate={onAudioTimeUpdate}
                onLoadedMetadata={onAudioLoadedMetadata}
                onDurationChange={onAudioLoadedMetadata}
                onEnded={onAudioEnded}
                style={{ display: "none" }}
              />
              <div
                className="audio-progress-container"
                ref={progressContainerRef}
                onMouseDown={handleProgressMouseDown}
              >
                <div
                  className="audio-progress-bar"
                  style={{
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                  }}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* Path Selection Modal */}
      <PathSelectionModal
        isOpen={showPathModal}
        onClose={() => {
          setShowPathModal(false);
          setPendingAction(null);
        }}
        onConfirm={handleConfirmPath}
      />
      <MergeModal
        isOpen={isMerging}
        onClose={() => setIsMerging(false)}
        onSubmit={async (fromBranch, toBranch) => {
          try {
            await window.ipcRenderer.invoke(
              "merge-branches",
              passedProject, // projectName
              projectId || "", // projectId
              fromBranch,
              toBranch,
              username || "unknown", // author
            );
            console.log(`Successfully merged ${fromBranch} into ${toBranch}`);
            setIsMerging(false);
            // Reload project log or UI
          } catch (error) {
            console.error("Merge failed:", error);
          }
        }}
        projectName={passedProject}
        projectId={projectId || ""}
      />
      {/* Unsaved Changes Warning Modal */}
      <WarningModal
        isOpen={showUnsavedWarning}
        warningType="unsaved-changes"
        title="Unsaved Changes Detected"
        message={
          <>
            You have unsaved changes in your project. Rolling back will lose
            those changes.
            <br />
            <br />
            Please save your changes first, or proceed anyway if you're sure.
          </>
        }
        actions={[
          { label: "Cancel", onClick: handleCancelCheckout, variant: "cancel" },
          {
            label: "Do It Anyway",
            onClick: handleProceedAnyway,
            variant: "warning",
          },
          {
            label: "Save First",
            onClick: handleCommitFirst,
            variant: "primary",
          },
        ]}
        onCancel={handleCancelCheckout}
      />
      {/* Duplicate Commit Warning Modal */}
      <WarningModal
        isOpen={showDuplicateWarning}
        warningType="duplicate-commit"
        title="No Changes Detected"
        message={
          <>
            Your project files haven't changed since the last save.
            <br />
            <br />
            This save will be identical to the previous one.
          </>
        }
        actions={[
          {
            label: "Cancel",
            onClick: handleCancelDuplicateCommit,
            variant: "cancel",
          },
          {
            label: "Save Anyway",
            onClick: handleDuplicateCommitAnyway,
            variant: "warning",
          },
        ]}
        onCancel={handleCancelDuplicateCommit}
      />
      {/* Storage Warning Modal */}
      <StorageWarningModal
        isOpen={showStorageWarning}
        onClose={() => {
          setShowStorageWarning(false);
          setPendingCheckoutStorageId(null);
        }}
        message={storageWarningMessage}
        onManageSettings={() => {
          setShowStorageWarning(false);
          setPendingCheckoutStorageId(null);
          navigate("/settings");
        }}
        onProceedAnyway={
          pendingCheckoutStorageId ? handleProceedCheckoutAnyway : undefined
        }
      />
      {/* Delete Commit Confirmation Modal */}
      <WarningModal
        isOpen={showDeleteConfirmation}
        warningType="delete-commit"
        title="Delete Version"
        showDontAskAgain={false}
        message={
          <>
            Are you sure you want to delete this version?
            <br />
            <br />
            This action cannot be undone. Any files unique to this version will
            be permanently removed.
          </>
        }
        actions={[
          {
            label: "Cancel",
            onClick: handleCancelDeleteCommit,
            variant: "cancel",
          },
          {
            label: isDeletingCommit ? "Deleting..." : "Delete Version",
            onClick: handleConfirmDeleteCommit,
            variant: "destructive",
          },
        ]}
        onCancel={handleCancelDeleteCommit}
      />
    </div>
  );
};
