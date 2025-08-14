import type { SupportedColor } from './SupportedColors';
import type { TaskBoardStatus } from './TaskBoard';

export interface TaskList {
  id: string;
  name: string;
  archived: boolean;
  deleted: boolean;
  created_at: string;
  board_id: string;
  creator_id: string;
  status: TaskBoardStatus;
  color: SupportedColor;
  position: number;
  href?: string;
}
