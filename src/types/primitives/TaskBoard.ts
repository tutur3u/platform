import { Task } from './Task';

export interface TaskBoard {
  id: string;
  name?: string;
  tasks?: Task[];
  created_at?: string;
}
