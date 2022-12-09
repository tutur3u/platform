import { Task } from './Task';

export interface TaskList {
  id: string;
  name: string;
  tasks: Task[];
  board_id: string;
  created_at?: string;
}
