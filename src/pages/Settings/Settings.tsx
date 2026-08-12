import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { useUsername } from '../../hooks/useUsername';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useNavigate } from 'react-router-dom';
import { Check, X, HardDrive, RefreshCw, ArrowLeft, FolderGit2, UserPlus, RotateCcw, ChevronDown, Trash2 } from 'lucide-react';
import { validateUsername, sanitizeUsername } from '../../utils/usernameUtils';
import './Settings.css';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const Settings: React.FC = () => {
  const { username } = useUsername();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Local users on this machine (each owns a separate registry/history namespace)
  const [users, setUsers] = useState<{ username: string; projectCount: number }[]>([]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createDraft, setCreateDraft] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(userMenuRef, () => setIsUserMenuOpen(false), isUserMenuOpen);

  // CAS storage state
  const [casUsage, setCasUsage] = useState<number>(0);
  const [casLimit, setCasLimit] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editUnit, setEditUnit] = useState<'MB' | 'GB' | 'TB'>('GB');
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [isLoadingCas, setIsLoadingCas] = useState(false);
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  // Default storage location for newly created projects
  const [defaultStorageMode, setDefaultStorageMode] = useState<'home' | 'project'>('home');
  const [isSavingStorageMode, setIsSavingStorageMode] = useState(false);

  const loadUsers = async (activeUser: string | null) => {
    try {
      const list: { username: string; projectCount: number }[] =
        await window.ipcRenderer.invoke('list-users-with-counts');
      const map = new Map((list ?? []).map((u) => [u.username, u.projectCount]));
      if (activeUser && !map.has(activeUser)) map.set(activeUser, 0);
      const arr = Array.from(map, ([u, projectCount]) => ({ username: u, projectCount }));
      arr.sort((a, b) => a.username.localeCompare(b.username));
      setUsers(arr);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  const activeProjectCount = users.find((u) => u.username === username)?.projectCount ?? 0;

  const switchUser = async (target: string) => {
    setIsUserMenuOpen(false);
    if (target === username) return;
    try {
      await window.ipcRenderer.invoke('set-username', target);
      // Reload so every per-user surface (projects, config, tags) mounts fresh.
      window.location.reload();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to switch user' });
    }
  };

  const deleteActiveUser = async () => {
    if (!username) return;
    try {
      await window.ipcRenderer.invoke('delete-user', username);
      const remaining = users.filter((u) => u.username !== username);
      if (remaining.length > 0) {
        await window.ipcRenderer.invoke('set-username', remaining[0].username);
      } else {
        // No users left — forget the active user so onboarding runs on reload.
        await window.ipcRenderer.invoke('reset-active-user');
      }
      window.location.reload();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to delete user' });
      setConfirmingDelete(false);
    }
  };

  const startCreatingUser = () => {
    setCreateDraft('');
    setCreateError(null);
    setIsCreatingUser(true);
  };

  const cancelCreatingUser = () => {
    setIsCreatingUser(false);
    setCreateDraft('');
    setCreateError(null);
  };

  const createUser = async () => {
    const validation = validateUsername(createDraft);
    if (!validation.isValid) {
      setCreateError(validation.error ?? 'Invalid username');
      return;
    }
    if (users.some((u) => u.username === createDraft)) {
      setCreateError('That user already exists');
      return;
    }
    setIsSavingUser(true);
    try {
      await window.ipcRenderer.invoke('set-username', createDraft);
      window.location.reload();
    } catch (err: any) {
      setCreateError(err?.message ?? 'Failed to create user');
      setIsSavingUser(false);
    }
  };

  const runSetupAgain = () => {
    window.dispatchEvent(new CustomEvent('dawlab:run-onboarding'));
  };

  const fetchCasUsage = async () => {
    setIsLoadingCas(true);
    try {
      const usage = await window.ipcRenderer.invoke('get-local-cas-usage');
      const limit = await window.ipcRenderer.invoke('get-cas-storage-limit');
      setCasUsage(usage || 0);
      setCasLimit(limit);

      if (limit) {
        const gb = limit / (1024 * 1024 * 1024);
        const mb = limit / (1024 * 1024);
        const tb = limit / (1024 * 1024 * 1024 * 1024);
        if (tb >= 1) { setEditValue(tb.toFixed(2)); setEditUnit('TB'); }
        else if (gb >= 1) { setEditValue(gb.toFixed(2)); setEditUnit('GB'); }
        else { setEditValue(mb.toFixed(2)); setEditUnit('MB'); }
      } else {
        setEditValue(''); setEditUnit('GB');
      }
    } catch (err) {
      console.error('Error fetching CAS storage data:', err);
    } finally {
      setIsLoadingCas(false);
    }
  };

  const saveCasLimit = async () => {
    if (!editValue.trim() || parseFloat(editValue) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid storage limit' });
      return;
    }
    setIsSavingLimit(true);
    try {
      const value = parseFloat(editValue);
      const multipliers = { TB: 1024 ** 4, GB: 1024 ** 3, MB: 1024 ** 2 };
      const limitBytes = value * multipliers[editUnit];
      await window.ipcRenderer.invoke('set-cas-storage-limit', limitBytes);
      setCasLimit(limitBytes);
      setIsEditingLimit(false);
      setMessage({ type: 'success', text: 'Storage limit updated successfully' });
      setTimeout(() => setMessage(null), 3000);
      await fetchCasUsage();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update storage limit' });
    } finally {
      setIsSavingLimit(false);
    }
  };

  const fetchDefaultStorageMode = async () => {
    try {
      const mode = await window.ipcRenderer.invoke('get-default-storage-mode');
      setDefaultStorageMode(mode === 'project' ? 'project' : 'home');
    } catch (err) {
      console.error('Error fetching default storage mode:', err);
    }
  };

  const saveDefaultStorageMode = async (mode: 'home' | 'project') => {
    setIsSavingStorageMode(true);
    try {
      await window.ipcRenderer.invoke('set-default-storage-mode', mode);
      setDefaultStorageMode(mode);
      setMessage({ type: 'success', text: 'Default storage location updated' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Failed to update default storage location' });
    } finally {
      setIsSavingStorageMode(false);
    }
  };

  React.useEffect(() => {
    if (username) fetchCasUsage();
    fetchDefaultStorageMode();
    loadUsers(username);
  }, [username]);

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button onClick={() => navigate(-1)} className="btn-icon back-btn" title="Back">
          <ArrowLeft size={24} />
        </button>
        <h1 className="settings-title">Settings</h1>
      </div>

      <div className="settings-form">
        {/* Users Section */}
        <div className="form-field">
          <label className="form-field-label">Users</label>
          <div className="form-field-content">
            <div className="user-select" ref={userMenuRef}>
              <button
                className={`user-trigger ${isUserMenuOpen ? 'is-open' : ''}`}
                onClick={() => setIsUserMenuOpen((o) => !o)}
              >
                <span className="user-trigger__info">
                  <span className="user-trigger__name">{username ?? 'unknown'}</span>
                  <span className="user-trigger__meta">
                    {activeProjectCount} project{activeProjectCount === 1 ? '' : 's'} · Active
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className={`user-trigger__chevron ${isUserMenuOpen ? 'is-open' : ''}`}
                />
              </button>

              {isUserMenuOpen && (
                <div className="user-dropdown">
                  <ul className="user-dropdown__list">
                    {users.map((u) => {
                      const isActive = u.username === username;
                      return (
                        <li
                          key={u.username}
                          className={`um-row ${isActive ? 'is-active' : ''}`}
                          onClick={() => !isActive && switchUser(u.username)}
                        >
                          <span className="um-row__info">
                            <span className="um-row__name">{u.username}</span>
                            <span className="um-row__count">
                              {u.projectCount} project{u.projectCount === 1 ? '' : 's'}
                            </span>
                          </span>
                          {isActive ? (
                            <span className="um-row__active">Active</span>
                          ) : (
                            <span className="um-row__switch">Switch</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {isCreatingUser ? (
                    <div className="um-create">
                      <input
                        type="text"
                        value={createDraft}
                        onChange={(e) => {
                          setCreateDraft(sanitizeUsername(e.target.value));
                          setCreateError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') createUser();
                          if (e.key === 'Escape') cancelCreatingUser();
                        }}
                        className={`um-create__input ${createError ? 'error' : ''}`}
                        placeholder="new username"
                        disabled={isSavingUser}
                        autoFocus
                      />
                      <button onClick={createUser} className="btn-icon btn-save" disabled={isSavingUser} title="Create and switch">
                        <Check size={18} />
                      </button>
                      <button onClick={cancelCreatingUser} className="btn-icon btn-cancel" disabled={isSavingUser} title="Cancel">
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <button className="um-add" onClick={startCreatingUser}>
                      <UserPlus size={16} /> Create user
                    </button>
                  )}
                  {createError && <span className="field-error">{createError}</span>}
                </div>
              )}
            </div>
            <span className="field-hint">
              Each user keeps its own projects and version history on this machine.
            </span>
          </div>
        </div>

        {/* Local Storage Section */}
        <div className="local-storage-section">
          <div className="section-header">
            <HardDrive size={16} className="section-icon" />
            <h2 className="local-storage-title">Local Storage</h2>
            <button
              className="refresh-button"
              onClick={fetchCasUsage}
              disabled={isLoadingCas}
              title="Refresh storage usage"
            >
              <RefreshCw size={14} className={isLoadingCas ? 'spin' : ''} />
            </button>
            <button
              className="clean-storage-btn"
              onClick={() => navigate('/settings/clean-storage')}
              title="Clean up unused files"
            >
              Clean Storage
            </button>
          </div>

          <div className="cas-usage-display">
            <div className="usage-info">
              <span className="usage-label">Current Usage:</span>
              <span className="usage-value">{formatBytes(casUsage)}</span>
            </div>

            {casLimit && (
              <div className="progress-container">
                <div
                  className={`progress-bar ${
                    (casUsage / casLimit) >= 0.95 ? 'danger' :
                    (casUsage / casLimit) >= 0.80 ? 'warning' : ''
                  }`}
                  style={{ width: `${Math.min(100, (casUsage / casLimit) * 100)}%` }}
                />
              </div>
            )}

            <div className="limit-display-row">
              <span className="limit-display-label">Limit:</span>
              <div className="limit-controls-wrapper">
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isEditingLimit) saveCasLimit();
                    if (e.key === 'Escape' && isEditingLimit) { setIsEditingLimit(false); fetchCasUsage(); }
                  }}
                  onClick={() => !isEditingLimit && setIsEditingLimit(true)}
                  placeholder={casLimit ? '' : 'Click to set'}
                  className={`limit-number-input ${!isEditingLimit ? 'readonly' : ''}`}
                  disabled={isSavingLimit}
                  readOnly={!isEditingLimit}
                  min="0"
                  step="0.1"
                />
                <select
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value as 'MB' | 'GB' | 'TB')}
                  onClick={() => !isEditingLimit && setIsEditingLimit(true)}
                  className={`limit-unit-dropdown ${!isEditingLimit ? 'readonly' : ''}`}
                  disabled={!isEditingLimit || isSavingLimit}
                >
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </select>
                {casUsage > 0 && casLimit && !isEditingLimit && (
                  <span className="limit-usage-percent">
                    ({Math.min(100, (casUsage / casLimit) * 100).toFixed(1)}% used)
                  </span>
                )}
                {isEditingLimit && (
                  <>
                    <button onClick={saveCasLimit} className="btn-icon btn-save" disabled={!editValue.trim() || isSavingLimit} title="Save">
                      <Check size={16} />
                    </button>
                    <button onClick={() => { setIsEditingLimit(false); fetchCasUsage(); }} className="btn-icon btn-cancel" disabled={isSavingLimit} title="Cancel">
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {!isEditingLimit && casLimit && <p className="limit-hint">Click to edit</p>}
          </div>
        </div>

        {/* Default Storage Location Section */}
        <div className="form-field">
          <label className="form-field-label">Default Storage Location</label>
          <div className="form-field-content">
            <div className="storage-mode-toggle" role="radiogroup" aria-label="Default storage location">
              <div className="storage-mode-option-wrapper">
                <button
                  type="button"
                  className={`storage-mode-option ${defaultStorageMode === 'home' ? 'active' : ''}`}
                  onClick={() => saveDefaultStorageMode('home')}
                  disabled={isSavingStorageMode}
                  aria-pressed={defaultStorageMode === 'home'}
                >
                  <HardDrive size={28} />
                  <span>Home Library</span>
                </button>
                {defaultStorageMode === 'home' && (
                  <motion.div
                    layoutId="settings-storage-mode-indicator"
                    className="storage-mode-indicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </div>
              <div className="storage-mode-option-wrapper">
                <button
                  type="button"
                  className={`storage-mode-option ${defaultStorageMode === 'project' ? 'active' : ''}`}
                  onClick={() => saveDefaultStorageMode('project')}
                  disabled={isSavingStorageMode}
                  aria-pressed={defaultStorageMode === 'project'}
                >
                  <FolderGit2 size={28} />
                  <span>Project Folder</span>
                </button>
                {defaultStorageMode === 'project' && (
                  <motion.div
                    layoutId="settings-storage-mode-indicator"
                    className="storage-mode-indicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </div>
            </div>
            <p className="field-hint">
              {defaultStorageMode === 'project'
                ? <>History lives inside each project folder, right next to your DAW files — if you delete the project, you delete its whole history too.</>
                : <>History is kept separately in your home library, so deleting a project folder elsewhere won't affect its history.</>}
              {' '}You can override this per-project when creating a new project.
            </p>
          </div>
        </div>

        {/* Account actions */}
        <div className="account-actions">
          <button className="account-actions__btn" onClick={runSetupAgain}>
            <RotateCcw size={15} /> Run setup again
          </button>
          {confirmingDelete ? (
            <div className="account-delete-confirm">
              <span className="account-delete-confirm__label">Delete “{username}”?</span>
              <button className="account-actions__btn account-actions__btn--danger" onClick={deleteActiveUser}>
                Delete
              </button>
              <button className="account-actions__btn" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="account-actions__btn account-actions__btn--danger"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={15} /> Delete user
            </button>
          )}
        </div>

        {/* Message Feedback */}
        {message && (
          <div className={`settings-message ${message.type === 'success' ? 'settings-success' : 'settings-error'}`}>
            {message.text}
          </div>
        )}

        {/* Footer */}
        <div className="settings-footer">
          <div className="footer-contact">
            <a href="mailto:team.dawlab@gmail.com" className="footer-email">
              team.dawlab@gmail.com
            </a>
            <button
              className="footer-feedback"
              onClick={() => window.ipcRenderer?.invoke('open-external-url', 'https://dawlab.online/feedback')}
            >
              Share Feedback
            </button>
          </div>
          <div className="footer-credits">
            <span className="footer-credits-label">Created by</span>
            <span className="footer-credits-names">
              Oleg Mrynskyi, Anthony Lamas, Rohit Mamidipaka, Cyrus Correll
            </span>
          </div>
          <div className="footer-version">
            DAWLab v{import.meta.env.VITE_APP_VERSION || '0.0.0'}
          </div>
        </div>
      </div>
    </div>
  );
};
