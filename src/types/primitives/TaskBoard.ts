import { TaskList } from './TaskList';

export interface TaskBoard {
  id: string;
  name: string;
  lists: TaskList[];
  created_at?: string;
}
