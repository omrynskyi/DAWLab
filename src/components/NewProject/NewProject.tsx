import React, { useCallback, useEffect, useState } from 'react';
import { FolderIcon, ChevronLeft, HardDrive, FolderGit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import './NewProject.css';
import { useUsername } from '@/hooks/useUsername';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StorageWarningModal } from '@/components/ui/StorageWarningModal';

// DAW logos
import logicLogo from '@/assets/logic_logo.png';
import abletonLogo from '@/assets/ableton_logo.png';
import flLogo from '@/assets/fl_logo.png';
import reaperLogo from '@/assets/reaper_logo.png';
import protoolsLogo from '@/assets/protools_logo.png';

// DAW walkthrough screenshots
import logicScreenshot from '@/assets/walkthought/Logic.png';
import abletonStep1 from '@/assets/walkthought/Ableton-step1.png';
import abletonStep2 from '@/assets/walkthought/Ableton-step2.png';
import abletonStep3 from '@/assets/walkthought/Ableton-step3.png';
import abletonStep4 from '@/assets/walkthought/Ableton-step4.png';
import flScreenshot from '@/assets/walkthought/FLStudio.png';
import reaperScreenshot from '@/assets/walkthought/Reaper.png';
import protoolsScreenshot from '@/assets/walkthought/Protools.png';

// DAW types
export type DawType = 'logic' | 'ableton' | 'fl' | 'reaper' | 'protools';

// Derive a project name from a folder path: take the last path segment and
// strip any trailing extension (e.g. a Logic project folder "Song.logicx").
const deriveNameFromPath = (folderPath: string): string => {
  const segments = folderPath.split(/[\\/]/).filter(Boolean);
  const base = segments[segments.length - 1] ?? '';
  return base.replace(/\.[^.]+$/, '');
};

interface DawInfo {
  id: DawType;
  name: string;
  logo: string;
}

const DAWS: DawInfo[] = [
  { id: 'logic', name: 'Logic Pro', logo: logicLogo },
  { id: 'ableton', name: 'Ableton Live', logo: abletonLogo },
  { id: 'fl', name: 'FL Studio', logo: flLogo },
  { id: 'reaper', name: 'Reaper', logo: reaperLogo },
  { id: 'protools', name: 'Pro Tools', logo: protoolsLogo },
];

interface NewProjectProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (projectId?: string) => void;
  // When opened from a drag-and-drop onto the library, these prefill the form and
  // skip straight to the project-details step (DAW is already detected).
  initialPath?: string;
  initialName?: string;
  initialDaw?: DawType;
}

// DAW Instructions Component
const DawInstructions: React.FC<{ daw: DawType }> = ({ daw }) => {
  switch (daw) {
    case 'logic':
      return (
        <div className="daw-instructions">
          <p className="daw-instruction-text">
            Click Save As, then save your project as a folder and select all the file formats used within that project
          </p>
          <ul className="daw-checklist">
            <li>Organize my project as: <strong>Folder</strong></li>
            <li>Copy the following files: <strong>Audio files, Sampler audio data</strong></li>
          </ul>
          <img src={logicScreenshot} alt="Logic Pro save dialog" className="daw-screenshot" />
        </div>
      );
    case 'ableton':
      return (
        <div className="daw-instructions ableton-instructions">
          <div className="daw-step">
            <h3 className="daw-step-title">Step 1:</h3>
            <div className="ableton-step-row">
              <img src={abletonStep1} alt="Ableton Save Live Set As menu" className="ableton-screenshot" />
              <div className="ableton-text-column">
                <p className="daw-instruction-text">
                  Save Live Set as its own project folder. Make sure this project folder only has 1 .als file
                </p>
                <img src={abletonStep2} alt="Ableton folder structure" className="ableton-screenshot" />
              </div>
            </div>
          </div>
          <div className="daw-step">
            <h3 className="daw-step-title">Step 2:</h3>
            <div className="ableton-step-row">
              <img src={abletonStep3} alt="Collect All and Save menu" className="ableton-screenshot" />
              <div className="ableton-text-column">
                <p className="daw-instruction-text">
                  Pack all resources so your collaborators have access to your samples and audio tracks.
                </p>
                <img src={abletonStep4} alt="Resource packing dialog" className="ableton-screenshot" />
              </div>
            </div>
          </div>
        </div>
      );
    case 'fl':
      return (
        <div className="daw-instructions">
          <p className="daw-instruction-text">
            When saving make sure:
          </p>
          <ul className="daw-checklist">
            <li>Check: <strong>Create new project folder</strong></li>
            <li>Check: <strong>Copy used samples to the project folder</strong></li>
          </ul>
          <img src={flScreenshot} alt="FL Studio save dialog" className="daw-screenshot" />
        </div>
      );
    case 'reaper':
      return (
        <div className="daw-instructions">
          <p className="daw-instruction-text">
            When saving make sure:
          </p>
          <ul className="daw-checklist">
            <li>Check: <strong>Create subdirectory for project</strong></li>
            <li>Check: <strong>Copy all media into project directory</strong></li>
          </ul>
          <img src={reaperScreenshot} alt="Reaper save dialog" className="daw-screenshot" />
        </div>
      );
    case 'protools':
      return (
        <div className="daw-instructions">
          <p className="daw-instruction-text">
            Before saving, go to <strong>Settings → Processing → </strong>Under Import check <em>"Automatically Copy Files on Import"</em>
          </p>
          <img src={protoolsScreenshot} alt="Pro Tools preferences" className="daw-screenshot" />
        </div>
      );
  }
};

export const NewProject: React.FC<NewProjectProps> = ({ isOpen, onClose, onSuccess, initialPath, initialName, initialDaw }) => {
  const { username } = useUsername();

  // Step state
  const [step, setStep] = useState<'daw-select' | 'project-form'>('daw-select');
  const [selectedDaw, setSelectedDaw] = useState<DawType>('logic');

  // Project form state
  const [projectName, setProjectName] = useState('');
  // Tracks whether the user has typed the name themselves. While false, picking a
  // folder auto-fills the name from the folder's basename; once the user edits it,
  // we stop overwriting their input.
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showStorageWarning, setShowStorageWarning] = useState(false);
  const [storageWarningMessage, setStorageWarningMessage] = useState('');
  const [storageMode, setStorageMode] = useState<'home' | 'project'>('home');

  // When a folder has more than one DAW project file, the user must pick
  // which one this project should track; the rest are ignored.
  const [fileCandidates, setFileCandidates] = useState<string[]>([]);
  const [selectedPrimaryFile, setSelectedPrimaryFile] = useState<string | null>(null);
  const [checkingCandidates, setCheckingCandidates] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    window.ipcRenderer.invoke('get-default-storage-mode')
      .then((mode: string) => setStorageMode(mode === 'project' ? 'project' : 'home'))
      .catch((err: unknown) => console.error('[NewProject] Failed to fetch default storage mode:', err));
  }, [isOpen]);

  // Pull the real project-file candidates so the UI can prompt the user to pick
  // one when a folder contains more than one DAW project file.
  const checkFileCandidates = useCallback(async (folderPath: string) => {
    setCheckingCandidates(true);
    try {
      const result = await window.ipcRenderer.invoke('get-project-file-candidates', folderPath, []);
      const candidates: string[] = result?.candidates || [];
      if (candidates.length > 1) {
        setFileCandidates(candidates);
        setSelectedPrimaryFile(null);
      } else {
        setFileCandidates([]);
        setSelectedPrimaryFile(candidates[0] ?? null);
      }
    } catch (err) {
      console.error('[NewProject] Failed to check project file candidates:', err);
      // Non-fatal — fall back to letting init-project resolve/validate on submit.
      setFileCandidates([]);
      setSelectedPrimaryFile(null);
    } finally {
      setCheckingCandidates(false);
    }
  }, []);

  // When opened from a drag-and-drop onto the library, jump straight to the
  // form step with the dropped folder's path and detected DAW prefilled.
  useEffect(() => {
    if (!isOpen || !initialPath) return;
    setStep('project-form');
    setSelectedDaw(initialDaw ?? 'logic');
    setProjectPath(initialPath);
    const droppedName = initialName ?? deriveNameFromPath(initialPath);
    setProjectName(droppedName);
    setNameManuallyEdited(Boolean(droppedName));
    setError(null);
    setFileCandidates([]);
    setSelectedPrimaryFile(null);
    checkFileCandidates(initialPath);
  }, [isOpen, initialPath, initialName, initialDaw, checkFileCandidates]);

  if (!isOpen) return null;

  const handleBrowse = async () => {
    console.log('[NewProject] Browse button clicked');
    try {
      console.log('[NewProject] Checking for electronAPI...', {
        hasWindow: typeof window !== 'undefined',
        hasElectronAPI: typeof window !== 'undefined' && 'electronAPI' in window,
        electronAPI: window.electronAPI
      });

      if (!window.electronAPI || !window.electronAPI.pickFolder) {
        console.error('[NewProject] electronAPI.pickFolder not available');
        setError('Folder picker not available. Running in web mode?');
        return;
      }

      console.log('[NewProject] Calling pickFolder...');
      const path = await window.electronAPI.pickFolder();
      console.log('[NewProject] Folder picked:', path);

      if (path) {
        setProjectPath(path);
        // Auto-fill the project name from the folder unless the user has typed one.
        if (!nameManuallyEdited) {
          setProjectName(deriveNameFromPath(path));
        }
        setError(null);
        setFileCandidates([]);
        setSelectedPrimaryFile(null);
        await checkFileCandidates(path);
      } else {
        console.log('[NewProject] No folder selected (user cancelled)');
      }
    } catch (err) {
      console.error('[NewProject] Error picking folder:', err);
      console.error('[NewProject] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      setError('Failed to select folder');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[NewProject] Submit button clicked');
    console.log('[NewProject] Form data:', {
      projectName,
      projectPath,
    });

    if (!projectName.trim()) {
      console.warn('[NewProject] Validation failed: No project name');
      setError('Please enter a project name');
      return;
    }

    if (!projectPath) {
      console.warn('[NewProject] Validation failed: No project path');
      setError('Please select a project path');
      return;
    }

    if (fileCandidates.length > 1 && !selectedPrimaryFile) {
      setError('This folder has multiple project files — choose which one to track');
      return;
    }

    console.log('[NewProject] Validation passed');

    setIsLoading(true);
    setError(null);

    try {

      console.log('[NewProject] Invoking init-project with params:', {
        command: 'init-project',
        projectName: projectName.trim(),
        projectPath: projectPath,
        metadata: {},
        autoOpen: true
      });
      const ignoredFiles = selectedPrimaryFile
        ? fileCandidates.filter((f) => f !== selectedPrimaryFile)
        : [];

      const result = await window.ipcRenderer.invoke(
        'init-project',
        projectName.trim(),
        projectPath,
        {
          author: username,
          storageMode,
          ...(selectedPrimaryFile ? { primaryFile: selectedPrimaryFile } : {}),
          ...(ignoredFiles.length > 0 ? { ignoredFiles } : {}),
        }
      );

      console.log('[NewProject] Project created successfully!', result);
      console.log('[NewProject] Result type:', typeof result);
      console.log('[NewProject] Result details:', JSON.stringify(result, null, 2));

      // Close modal first, then trigger success callback to refresh the list
      onClose();

      if (onSuccess) {
        console.log('[NewProject] Calling onSuccess callback');
        onSuccess(result?.projectId);
      }
    } catch (err) {
      console.error('[NewProject] Error creating project:', err);
      console.error('[NewProject] Error type:', typeof err);
      console.error('[NewProject] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined
      });

      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // Check for storage limit exceeded error
      if (errorMessage.includes('Storage limit exceeded') || errorMessage.includes('403')) {
        setStorageWarningMessage("You don't have enough storage space for this action.");
        setShowStorageWarning(true);
      } else {
        setError(`Failed to create project: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    console.log('[NewProject] Cancel clicked, closing modal');
    // Reset state
    setStep('daw-select');
    setSelectedDaw('logic');
    setProjectName('');
    setNameManuallyEdited(false);
    setProjectPath('');
    setError(null);
    setFileCandidates([]);
    setSelectedPrimaryFile(null);
    onClose();
  };

  const handleBack = () => {
    setStep('daw-select');
    setError(null);
  };

  const handleConfirmDaw = () => {
    setStep('project-form');
  };

  return (
    <div className="new-project-modal-overlay" onClick={handleCancel}>
      <div className="new-project-container" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="close-button" onClick={handleCancel} title="Close">
          <div className="close-dot" />
        </button>

        <AnimatePresence mode="wait">
          {step === 'daw-select' ? (
            <motion.div
              key="daw-select"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="daw-select-step"
            >
              {/* DAW Selector */}
              <div className="daw-selector">
                {DAWS.map((daw) => (
                  <div key={daw.id} className="daw-option-wrapper">
                    <button
                      type="button"
                      className={`daw-option ${selectedDaw === daw.id ? 'active' : ''}`}
                      onClick={() => setSelectedDaw(daw.id)}
                      title={daw.name}
                    >
                      <img src={daw.logo} alt={daw.name} className="daw-logo" />
                    </button>
                    {selectedDaw === daw.id && (
                      <motion.div
                        layoutId="daw-indicator"
                        className="daw-indicator"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* DAW-specific Instructions */}
              <DawInstructions daw={selectedDaw} />

              {/* Confirm Button */}
              <div className="daw-actions">
                <button
                  type="button"
                  className="action-button primary daw-confirm-button"
                  onClick={handleConfirmDaw}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="project-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Back Button */}
              <button className="back-button" onClick={handleBack} title="Back to DAW selection">
                <ChevronLeft size={20} />
                <span>Back</span>
              </button>

              <form onSubmit={handleSubmit} className="new-project-form">
                {/* Project Name */}
                <div className="form-section">
                  <input
                    type="text"
                    className="project-name-input"
                    placeholder="Project Name"
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      setNameManuallyEdited(true);
                    }}
                    required
                  />
                </div>

                {/* Select Project Path */}
                <div className="form-section">
                  <label className="section-label">Select Project Path</label>
                  <button
                    type="button"
                    className="browse-button"
                    onClick={handleBrowse}
                  >
                    <span>{projectPath || 'Browse'}</span>
                    <FolderIcon size={18} />
                  </button>
                  {checkingCandidates && (
                    <p className="daw-instruction-text">Checking folder for project files…</p>
                  )}
                </div>

                {/* Multiple project files found - pick which one to track */}
                {fileCandidates.length > 1 && (
                  <div className="form-section">
                    <label className="section-label">
                      This folder has {fileCandidates.length} project files — which one should DAWLab track?
                    </label>
                    <div className="daw-checklist" role="radiogroup" aria-label="Select project file">
                      {fileCandidates.map((file) => (
                        <label key={file} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="primary-file"
                            value={file}
                            checked={selectedPrimaryFile === file}
                            onChange={() => setSelectedPrimaryFile(file)}
                          />
                          {file}
                        </label>
                      ))}
                    </div>
                    <p className="daw-instruction-text">
                      The others will stay in the folder untracked. You can change this later in project settings.
                    </p>
                  </div>
                )}

                {/* Storage Location */}
                <div className="form-section">
                  <label className="section-label">Storage Location</label>
                  <div className="storage-mode-toggle" role="radiogroup" aria-label="Storage location">
                    <div className="storage-mode-option-wrapper">
                      <button
                        type="button"
                        className={`storage-mode-option ${storageMode === 'home' ? 'active' : ''}`}
                        onClick={() => setStorageMode('home')}
                        aria-pressed={storageMode === 'home'}
                      >
                        <HardDrive size={28} />
                        <span>Home Library</span>
                      </button>
                      {storageMode === 'home' && (
                        <motion.div
                          layoutId="storage-mode-indicator"
                          className="storage-mode-indicator"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                    </div>
                    <div className="storage-mode-option-wrapper">
                      <button
                        type="button"
                        className={`storage-mode-option ${storageMode === 'project' ? 'active' : ''}`}
                        onClick={() => setStorageMode('project')}
                        aria-pressed={storageMode === 'project'}
                      >
                        <FolderGit2 size={28} />
                        <span>Project Folder</span>
                      </button>
                      {storageMode === 'project' && (
                        <motion.div
                          layoutId="storage-mode-indicator"
                          className="storage-mode-indicator"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                    </div>
                  </div>
                  <p className="storage-mode-hint">
                    {storageMode === 'project'
                      ? "History lives inside the project folder, right next to your DAW files — if you delete the project, you delete its whole history too."
                      : "History is kept separately in your home library, so deleting the project folder elsewhere won't affect its history."}
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="error-message">
                    {error}
                  </div>
                )}

                {/* Submit Button (Hidden - submit on form submit) */}
                <button type="submit" style={{ display: 'none' }}>Submit</button>
              </form>

              {/* Action Buttons */}
              <div className="form-actions">
                <button
                  type="button"
                  className="action-button secondary"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="action-button primary"
                  onClick={handleSubmit}
                  disabled={isLoading}
                  style={{ opacity: isLoading ? 0.7 : 1, minWidth: '140px' }}
                >
                  {isLoading ? (
                    <LoadingSpinner variant="button" buttonText="Creating..." />
                  ) : (
                    'Create Project'
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Storage Warning Modal */}
      <StorageWarningModal
        isOpen={showStorageWarning}
        onClose={() => setShowStorageWarning(false)}
        message={storageWarningMessage}
        onUpgrade={() => {
          setShowStorageWarning(false);
          // TODO: Navigate to upgrade page
        }}
      />
    </div>
  );
};
