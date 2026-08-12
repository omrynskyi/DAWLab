import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Copy, FolderOpen, Check } from "lucide-react";
import { ChangeProjectPathModal } from '@/components/ChangeProjectPathModal';
import { TagChip } from '@/components/ui/TagChip';
import { TagInput } from '@/components/ui/TagInput';
import "./ProjectSettings.css";

interface ProjectSettingsProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

interface EditingProject {
  id: string;
  genre?: string;
  daw?: string;
  description?: string;
  bpm?: number;
  key?: string;
  project_path?: string;
  tags?: string[];
}

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
  projectId,
  projectName,
  onBack,
}) => {
  const navigate = useNavigate();
  const [editingProject, setEditingProject] = useState<EditingProject | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Change path modal state
  const [showChangePathModal, setShowChangePathModal] = useState(false);

  // Copy feedback state
  const [pathCopied, setPathCopied] = useState(false);

  // Tag colors state
  const [tagColors, setTagColors] = useState<Record<string, string>>({});

  // Load project details and tag colors on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [details, colors] = await Promise.all([
          window.ipcRenderer.invoke('get-project-details', projectId),
          window.ipcRenderer.invoke('load-tag-colors')
        ]);

        setTagColors(colors || {});

        setEditingProject({
          id: projectId,
          genre: details.genre || "",
          daw: details.daw || "",
          description: details.description || "",
          bpm: details.bpm,
          key: details.key || "",
          project_path: details.project_path || '',
          tags: details.tags || [],
        });
      } catch (error) {
        console.error("Failed to load project details:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    try {
      setSaving(true);
      setStatusMessage(null);

      // Build updates object with only changed fields (DAW is read-only)
      const updates: Record<string, any> = {};
      if (editingProject.genre) updates.genre = editingProject.genre;
      if (editingProject.description)
        updates.description = editingProject.description;
      if (editingProject.bpm) updates.bpm = editingProject.bpm;
      if (editingProject.key) updates.key = editingProject.key;

      if (Object.keys(updates).length > 0) {
        await window.ipcRenderer.invoke(
          "modify-project-details",
          editingProject.id,
          updates,
        );
        console.log("Project details updated successfully");
        setStatusMessage({ type: 'success', text: 'Settings saved!' });
      }
    } catch (error) {
      console.error('Failed to update project:', error);
      setStatusMessage({
        type: 'error',
        text: 'Failed to update project settings'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (deleteConfirmText !== projectName) return;

    try {
      setDeleting(true);
      console.log("[ProjectSettings] Deleting project:", projectName);

      const result = await window.ipcRenderer.invoke(
        "delete-project",
        projectName,
      );
      console.log("[ProjectSettings] Delete result:", result);

      setShowDeleteModal(false);
      navigate("/");
    } catch (error) {
      console.error("[ProjectSettings] Failed to delete project:", error);
      setStatusMessage({
        type: "error",
        text: "Failed to delete project. Please try again.",
      });
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
      setDeleteConfirmText("");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-gray-400 gap-4">
        <div className="settings-loading-spinner" />
        <p>Loading project settings...</p>
      </div>
    );
  }

  if (!editingProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-gray-400 gap-4">
        <p>Failed to load project settings</p>
        <button onClick={onBack} className="btn-secondary">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="project-settings">
      <form onSubmit={handleEditSubmit} className="project-settings-form">
        <div className="form-field">
          <label className="form-field-label">Genre</label>
          <input
            type="text"
            value={editingProject.genre || ""}
            onChange={(e) =>
              setEditingProject({ ...editingProject, genre: e.target.value })
            }
            placeholder="e.g., House, Techno, Hip Hop"
            className="form-field-input"
          />
        </div>

        <div className="form-field">
          <label className="form-field-label">DAW</label>
          <input
            type="text"
            value={editingProject.daw || "Not specified"}
            disabled
            className="form-field-input"
          />
        </div>

        {/* Project Path Section */}
        <div className="form-field">
          <div className="project-path-label-row">
            <label className="form-field-label">Project Path</label>
            <div className="project-path-actions">
              <button
                type="button"
                onClick={() => {
                  if (editingProject.project_path) {
                    navigator.clipboard.writeText(editingProject.project_path);
                    setPathCopied(true);
                    setTimeout(() => setPathCopied(false), 2000);
                  }
                }}
                className="project-path-icon-button"
                title={pathCopied ? "Copied!" : "Copy path"}
              >
                {pathCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (editingProject.project_path) {
                    await window.ipcRenderer.invoke('open-in-finder', editingProject.project_path);
                  }
                }}
                className="project-path-icon-button"
                title="Open in Finder"
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </div>
          <div className="project-path-display-container">
            <div className="project-path-display">
              {editingProject.project_path
                ? editingProject.project_path.replace(/ /g, ' ').replace(/\//g, '​/')
                : 'Not specified'}
            </div>
            <button
              type="button"
              onClick={() => setShowChangePathModal(true)}
              className="project-path-change-button"
            >
              Change Path
            </button>
          </div>
        </div>

        <div className="form-field">
          <label className="form-field-label">Description</label>
          <textarea
            value={editingProject.description || ""}
            onChange={(e) =>
              setEditingProject({
                ...editingProject,
                description: e.target.value,
              })
            }
            placeholder="Describe your project..."
            rows={3}
            className="form-field-textarea"
          />
        </div>

        <div className="form-field">
          <label className="form-field-label">BPM</label>
          <input
            type="number"
            value={editingProject.bpm || ""}
            onChange={(e) =>
              setEditingProject({
                ...editingProject,
                bpm: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="e.g., 128"
            min="1"
            max="999"
            className="form-field-input"
          />
        </div>

        <div className="form-field">
          <label className="form-field-label">Key</label>
          <input
            type="text"
            value={editingProject.key || ""}
            onChange={(e) =>
              setEditingProject({ ...editingProject, key: e.target.value })
            }
            placeholder="e.g., A minor, C# major"
            className="form-field-input"
          />
        </div>

        {/* Tags Section */}
        <div className="form-field">
          <label className="form-field-label">Tags</label>
          <div className="tags-layout-grid">
            <div className="tags-list-column">
              <div className="tags-list-header">Current Tags</div>
              <div className="tags-list-content">
                {(editingProject.tags || []).length === 0 && (
                  <span className="no-tags-placeholder">No tags assigned</span>
                )}
                {(editingProject.tags || []).map((tag) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    color={tagColors[tag]}
                    removable
                    onRemove={() => {
                      // Optimistic update - remove from UI immediately
                      const previousTags = editingProject.tags || [];
                      setEditingProject({
                        ...editingProject,
                        tags: previousTags.filter(t => t !== tag)
                      });
                      // Sync to database in background
                      window.ipcRenderer.invoke('delete-tag-from-project', editingProject.id, tag)
                        .catch(err => {
                          console.error('Failed to remove tag:', err);
                          // Revert on failure
                          setEditingProject(prev => prev ? {
                            ...prev,
                            tags: [...(prev.tags || []), tag]
                          } : prev);
                          setStatusMessage({
                            type: 'error',
                            text: 'Failed to remove tag'
                          });
                        });
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="tags-input-column">
              <div className="tags-input-header">Add New</div>
              <div className="tag-input-wrapper-full">
                <TagInput
                  onAddTag={(newTag, color) => {
                    if ((editingProject.tags || []).includes(newTag)) {
                      setStatusMessage({
                        type: 'error',
                        text: 'Tag already exists'
                      });
                      return;
                    }

                    // Optimistic update - add to UI immediately
                    setEditingProject({
                      ...editingProject,
                      tags: [...(editingProject.tags || []), newTag]
                    });

                    // Update local tag colors if a custom color is chosen
                    if (color && color !== '#007bff') {
                      setTagColors(prev => ({ ...prev, [newTag]: color }));
                      // Persist color preference
                      window.ipcRenderer.invoke('save-tag-color', newTag, color)
                        .catch(err => console.error('Failed to save tag color:', err));
                    }

                    // Sync to database in background
                    window.ipcRenderer.invoke('add-tag-to-project', editingProject.id, newTag)
                      .catch(err => {
                        console.error('Failed to add tag:', err);
                        // Revert on failure
                        setEditingProject(prev => prev ? {
                          ...prev,
                          tags: (prev.tags || []).filter(t => t !== newTag)
                        } : prev);
                        setStatusMessage({
                          type: 'error',
                          text: 'Failed to add tag'
                        });
                      });
                  }}
                  maxLength={30}
                  placeholder="Add tag..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`invite-message ${statusMessage.type === "success" ? "invite-success" : "invite-error"}`}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="form-actions">
          <button type="button" onClick={onBack} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="danger-zone">
        <div className="danger-zone-header">
          <AlertTriangle size={18} color="#ef4444" />
          <h3 className="danger-zone-title">Danger Zone</h3>
        </div>
        <p className="danger-zone-description">
          Once you delete a project, there is no going back. This will permanently remove the project, all commits, and any unused file hashes from your local storage.
        </p>

        <button type="button" onClick={() => setShowDeleteModal(true)} className="btn-danger">
          Delete Project
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="delete-modal-overlay"
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="delete-modal-title">Delete Project</h2>
            <p className="delete-modal-text">
              This action cannot be undone. This will permanently delete the
              project
              <strong> {projectName}</strong>, including all commits and
              orphaned file hashes.
            </p>
            <p className="delete-modal-text">
              Please type <strong>{projectName}</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type project name to confirm"
              className="delete-modal-input"
              autoFocus
              disabled={deleting}
            />
            <div className="delete-modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                className="btn-danger"
                disabled={deleteConfirmText !== projectName || deleting}
              >
                {deleting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Path Modal */}
      {showChangePathModal && editingProject && (
        <ChangeProjectPathModal
          isOpen={showChangePathModal}
          onClose={() => setShowChangePathModal(false)}
          currentPath={editingProject.project_path || ''}
          projectId={projectId}
          onPathChanged={() => {
            // Reload project details to get updated path
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};
