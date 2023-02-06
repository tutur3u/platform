import { Priority } from './Priority';

export interface Task {
  id: string;
  name: string;
  description?: string;
  completed?: boolean;
  priority?: Priority;
  start_date?: Date | null;
  end_date?: Date | null;
  list_id: string;
  board_id: string;
  created_at?: string;
}
