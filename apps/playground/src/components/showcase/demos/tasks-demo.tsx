'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import {
  type FormEvent,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from 'react';
import { hasRoom, SHOWCASE_LIMITS } from '@/lib/showcase/limits';
import {
  type DemoTask,
  initialTasksState,
  isTaskDone,
  TASK_COLUMN_LABELS,
  TASK_COLUMNS,
  tasksReducer,
} from '@/lib/showcase/tasks';
import { DemoPanel, FieldMessage } from '../demo-panel';
import { ArrowLeftIcon, ArrowRightIcon } from '../icons';
import { fieldLabel, focusRing } from '../styles';

export function TasksDemo() {
  const [state, dispatch] = useReducer(tasksReducer, initialTasksState);
  const [draft, setDraft] = useState('');
  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const messageId = useId();
  const full = !hasRoom(state.tasks, SHOWCASE_LIMITS.listItems);

  // Toggling or moving re-parents a card; keep keyboard focus on it.
  useEffect(() => {
    if (focusTaskId === null) return;
    boardRef.current
      ?.querySelector<HTMLElement>(`[data-task-id="${focusTaskId}"]`)
      ?.focus();
    setFocusTaskId(null);
  }, [focusTaskId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || full) return;
    dispatch({ type: 'add', title: draft });
    setDraft('');
  };

  return (
    <DemoPanel
      label="Tasks demo"
      onReset={() => {
        dispatch({ type: 'reset' });
        setDraft('');
      }}
    >
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={submit}
      >
        <div className="flex-1 space-y-1.5">
          <label className={fieldLabel} htmlFor={inputId}>
            New task
          </label>
          <Input
            aria-describedby={full ? messageId : undefined}
            autoComplete="off"
            disabled={full}
            id={inputId}
            maxLength={SHOWCASE_LIMITS.titleLength}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What needs doing?"
            value={draft}
          />
        </div>
        <Button disabled={full || !draft.trim()} type="submit">
          Add task
        </Button>
      </form>
      {full ? (
        <div className="mt-2">
          <FieldMessage id={messageId}>
            The board holds {SHOWCASE_LIMITS.listItems} tasks. Reset to start
            over.
          </FieldMessage>
        </div>
      ) : null}

      <div ref={boardRef} className="mt-5 grid gap-4 md:grid-cols-3">
        {TASK_COLUMNS.map((column, columnIndex) => {
          const tasks = state.tasks.filter((task) => task.column === column);
          const headingId = `${inputId}-${column}`;
          return (
            <section
              key={column}
              aria-labelledby={headingId}
              className="rounded-lg bg-muted/50 p-3"
            >
              <h3
                className="flex items-center justify-between font-semibold text-sm"
                id={headingId}
              >
                {TASK_COLUMN_LABELS[column]}
                <span className="font-normal text-muted-foreground text-xs">
                  {tasks.length}
                </span>
              </h3>
              {tasks.length === 0 ? (
                <p className="mt-3 rounded-md border border-border border-dashed px-3 py-4 text-center text-muted-foreground text-sm">
                  Nothing here
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      canMoveLeft={columnIndex > 0}
                      canMoveRight={columnIndex < TASK_COLUMNS.length - 1}
                      onMove={(direction) => {
                        dispatch({ type: 'move', id: task.id, direction });
                        setFocusTaskId(task.id);
                      }}
                      onToggle={() => {
                        dispatch({ type: 'toggle', id: task.id });
                        setFocusTaskId(task.id);
                      }}
                      task={task}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </DemoPanel>
  );
}

function TaskCard({
  task,
  canMoveLeft,
  canMoveRight,
  onToggle,
  onMove,
}: {
  task: DemoTask;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const done = isTaskDone(task);
  const checkboxId = useId();
  const index = TASK_COLUMNS.indexOf(task.column);
  const moveButton = cn(
    'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40',
    focusRing
  );

  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <input
        checked={done}
        className={cn('size-4 shrink-0 accent-primary', focusRing)}
        data-task-id={task.id}
        id={checkboxId}
        onChange={onToggle}
        type="checkbox"
      />
      <label
        className={cn(
          'min-w-0 flex-1 break-words text-sm',
          done && 'text-muted-foreground line-through'
        )}
        htmlFor={checkboxId}
      >
        {task.title}
      </label>
      <div className="flex shrink-0">
        <button
          aria-label={`Move "${task.title}" to ${TASK_COLUMN_LABELS[TASK_COLUMNS[index - 1] ?? task.column]}`}
          className={moveButton}
          disabled={!canMoveLeft}
          onClick={() => onMove(-1)}
          type="button"
        >
          <ArrowLeftIcon />
        </button>
        <button
          aria-label={`Move "${task.title}" to ${TASK_COLUMN_LABELS[TASK_COLUMNS[index + 1] ?? task.column]}`}
          className={moveButton}
          disabled={!canMoveRight}
          onClick={() => onMove(1)}
          type="button"
        >
          <ArrowRightIcon />
        </button>
      </div>
    </li>
  );
}
