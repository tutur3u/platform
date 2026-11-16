import { cleanText, hasRoom, SHOWCASE_LIMITS } from './limits';

export const TASK_COLUMNS = ['todo', 'doing', 'done'] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number];

export const TASK_COLUMN_LABELS: Record<TaskColumn, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
};

export type DemoTask = { id: number; title: string; column: TaskColumn };

export type TasksState = { tasks: DemoTask[]; nextId: number };

export type TasksAction =
  | { type: 'add'; title: string }
  | { type: 'toggle'; id: number }
  | { type: 'move'; id: number; direction: -1 | 1 }
  | { type: 'reset' };

export const initialTasksState: TasksState = {
  tasks: [
    { id: 1, title: 'Draft the launch checklist', column: 'todo' },
    { id: 2, title: 'Review onboarding copy', column: 'todo' },
    { id: 3, title: 'Prepare sprint demo', column: 'doing' },
    { id: 4, title: 'Book the team retro', column: 'done' },
  ],
  nextId: 5,
};

/** Completion is the Done column, so a task can never be done elsewhere. */
export function isTaskDone(task: DemoTask): boolean {
  return task.column === 'done';
}

export function tasksReducer(
  state: TasksState,
  action: TasksAction
): TasksState {
  switch (action.type) {
    case 'add': {
      const title = cleanText(action.title, SHOWCASE_LIMITS.titleLength);
      if (!title || !hasRoom(state.tasks, SHOWCASE_LIMITS.listItems))
        return state;
      return {
        tasks: [...state.tasks, { id: state.nextId, title, column: 'todo' }],
        nextId: state.nextId + 1,
      };
    }
    case 'toggle':
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id
            ? { ...task, column: isTaskDone(task) ? 'todo' : 'done' }
            : task
        ),
      };
    case 'move':
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          if (task.id !== action.id) return task;
          const index = TASK_COLUMNS.indexOf(task.column) + action.direction;
          const column = TASK_COLUMNS[index];
          return column ? { ...task, column } : task;
        }),
      };
    case 'reset':
      return initialTasksState;
  }
}
