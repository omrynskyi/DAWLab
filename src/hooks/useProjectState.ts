import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectTask } from '@/lib/projectState';

const NOTEPAD_SAVE_DELAY_MS = 600;

/**
 * Loads and persists a project's state (stage, tasks, notepad). Stage and task
 * changes save immediately; notepad edits are debounced and flushed on unmount
 * so typing doesn't write the registry on every keystroke.
 */
export function useProjectState(projectId: string | undefined) {
  const [stage, setStageState] = useState<string | null>(null);
  const [tasks, setTasksState] = useState<ProjectTask[]>([]);
  const [notepad, setNotepadState] = useState('');
  const [loaded, setLoaded] = useState(false);

  const pendingNotepad = useRef<string | null>(null);
  const notepadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (updates: Partial<{ stage: string | null; tasks: ProjectTask[]; notepad: string }>) => {
      if (!projectId) return;
      window.ipcRenderer
        .invoke('update-project-state', projectId, updates)
        .catch((err: unknown) => console.error('[useProjectState] Failed to save:', err));
    },
    [projectId],
  );

  const flushNotepad = useCallback(() => {
    if (notepadTimer.current) {
      clearTimeout(notepadTimer.current);
      notepadTimer.current = null;
    }
    if (pendingNotepad.current !== null) {
      persist({ notepad: pendingNotepad.current });
      pendingNotepad.current = null;
    }
  }, [persist]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoaded(false);
    window.ipcRenderer
      .invoke('get-project-details', projectId)
      .then((details: any) => {
        if (cancelled || !details) return;
        setStageState(details.stage ?? null);
        setTasksState(Array.isArray(details.tasks) ? details.tasks : []);
        setNotepadState(details.notepad ?? '');
      })
      .catch((err: unknown) => console.error('[useProjectState] Failed to load:', err))
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Don't lose the last few keystrokes when leaving the page.
  useEffect(() => flushNotepad, [flushNotepad]);

  const setStage = useCallback((next: string | null) => {
    setStageState(next);
    persist({ stage: next });
  }, [persist]);

  const setTasks = useCallback((next: ProjectTask[]) => {
    setTasksState(next);
    persist({ tasks: next });
  }, [persist]);

  const setNotepad = useCallback((next: string) => {
    setNotepadState(next);
    pendingNotepad.current = next;
    if (notepadTimer.current) clearTimeout(notepadTimer.current);
    notepadTimer.current = setTimeout(flushNotepad, NOTEPAD_SAVE_DELAY_MS);
  }, [flushNotepad]);

  return { loaded, stage, tasks, notepad, setStage, setTasks, setNotepad, flushNotepad };
}
