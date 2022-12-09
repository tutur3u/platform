import { Task } from './Task';

export interface TaskList {
  id: string;
  name: string;
  tasks: Task[];
  created_at?: string;
}
