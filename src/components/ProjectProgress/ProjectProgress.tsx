import React, { useState } from 'react';
import { Circle, CircleCheck, X } from 'lucide-react';
import { createTask, openTaskCount } from '@/lib/projectState';
import type { ProjectTask } from '@/lib/projectState';
import './ProjectProgress.css';

interface ProjectProgressProps {
  tasks: ProjectTask[];
  onTasksChange: (tasks: ProjectTask[]) => void;
  notepad: string;
  onNotepadChange: (text: string) => void;
  onNotepadBlur?: () => void;
}

const MAX_TASK_LENGTH = 200;

/**
 * Project-level tasks and notepad, shown beside Files and Plugins on the
 * History page. Scoped to the project, not the selected version.
 */
export const ProjectProgress: React.FC<ProjectProgressProps> = ({
  tasks,
  onTasksChange,
  notepad,
  onNotepadChange,
  onNotepadBlur,
}) => {
  const [draft, setDraft] = useState('');

  const addTask = () => {
    const text = draft.trim();
    if (!text) return;
    onTasksChange([...tasks, createTask(text)]);
    setDraft('');
  };

  const toggleTask = (id: string) =>
    onTasksChange(tasks.map(t => (t.id === id ? { ...t, done: !t.done } : t)));

  const removeTask = (id: string) => onTasksChange(tasks.filter(t => t.id !== id));

  // Open tasks first, then finished ones, each in the order they were added.
  const ordered = [...tasks.filter(t => !t.done), ...tasks.filter(t => t.done)];
  const open = openTaskCount(tasks);

  return (
    <div className="project-progress">
      <div className="project-progress-container">
        <div className="project-progress-group">
          <div className="project-progress-label">
            Tasks{tasks.length > 0 && ` · ${open} open`}
          </div>

          {ordered.map(task => (
            <div key={task.id} className={`project-task${task.done ? ' project-task--done' : ''}`}>
              <button
                type="button"
                className="project-task-check"
                onClick={() => toggleTask(task.id)}
                aria-label={task.done ? `Mark "${task.text}" as open` : `Mark "${task.text}" as done`}
              >
                {task.done ? <CircleCheck size={18} /> : <Circle size={18} />}
              </button>
              <span className="project-task-text" title={task.text}>{task.text}</span>
              <button
                type="button"
                className="project-task-remove"
                onClick={() => removeTask(task.id)}
                aria-label={`Remove "${task.text}"`}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Blank task row — type into it and press Enter to add. */}
          <div className="project-task project-task--blank">
            <span className="project-task-check" aria-hidden="true">
              <Circle size={18} />
            </span>
            <input
              type="text"
              className="project-task-text project-task-field"
              value={draft}
              maxLength={MAX_TASK_LENGTH}
              placeholder="Add a task…"
              aria-label="New task"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTask();
                }
                if (e.key === 'Escape') setDraft('');
              }}
              onBlur={addTask}
            />
          </div>
        </div>

        <div className="project-progress-group project-progress-group--fill">
          <div className="project-progress-label">Notepad</div>
          <textarea
            className="project-notepad"
            value={notepad}
            onChange={e => onNotepadChange(e.target.value)}
            onBlur={onNotepadBlur}
            placeholder="Ideas, lyrics, references, plans for this song…"
          />
        </div>
      </div>
    </div>
  );
};
