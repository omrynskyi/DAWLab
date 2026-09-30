/**
 * Project state — where a song is in its lifecycle (stage), what's left to do
 * (tasks), and a free-form notepad. All three are scoped to the project rather
 * than a version, and persisted in the registry via `update-project-state`.
 */

export interface ProjectTask {
  id: string;
  text: string;
  done: boolean;
}

export interface ProjectStage {
  id: string;
  label: string;
  color: string; // hex accent, drawn from the ColorPalette presets
}

/** Fixed lifecycle, in order. Colors reuse the ColorPalette presets. */
export const PROJECT_STAGES: ProjectStage[] = [
  { id: 'idea', label: 'Idea', color: '#eab308' },
  { id: 'writing', label: 'Writing', color: '#f97316' },
  { id: 'recording', label: 'Recording', color: '#ef4444' },
  { id: 'production', label: 'Production', color: '#ec4899' },
  { id: 'mixing', label: 'Mixing', color: '#007bff' },
  { id: 'mastering', label: 'Mastering', color: '#8b5cf6' },
  { id: 'finished', label: 'Finished', color: '#22c55e' },
];

/** Resolve a stored stage id to its definition; unknown/empty ids resolve to null. */
export function getStage(id: string | null | undefined): ProjectStage | null {
  if (!id) return null;
  return PROJECT_STAGES.find(s => s.id === id) ?? null;
}

/** Number of tasks not yet checked off. */
export function openTaskCount(tasks: ProjectTask[] | null | undefined): number {
  return (tasks ?? []).filter(t => !t.done).length;
}

export function createTask(text: string): ProjectTask {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    done: false,
  };
}
