export interface Board {
  id: string;
  name: string;
  task_lists?: { id: string; name: string }[];
}

export interface CommandPage {
  root: 'root';
  addTask: 'add-task';
  timeTracker: 'time-tracker';
}

export type CommandPageType = CommandPage[keyof CommandPage];
