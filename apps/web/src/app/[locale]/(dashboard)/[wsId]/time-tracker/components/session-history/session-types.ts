import type { TimeTrackingCategory, Workspace, WorkspaceTask } from '@tuturuuu/types';
import type { SessionWithRelations } from '../../types';

export type ViewMode = 'day' | 'week' | 'month';

export interface StackedSession {
  id: string;
  title: string;
  description?: string;
  category: TimeTrackingCategory | null;
  task: WorkspaceTask | null;
  sessions: SessionWithRelations[]; // All sessions in this stack
  totalDuration: number; // Sum of all durations (full session durations)
  periodDuration: number; // Duration that falls within the viewed period/day (for split sessions)
  firstStartTime: string; // Earliest start time
  lastEndTime: string | null; // Latest end time
  displayDate?: string; // The date this stack is displayed under (for split sessions)
}

export interface SessionHistoryProps {
  wsId: string;
  sessions: SessionWithRelations[] | null;
  categories: TimeTrackingCategory[] | null;
  tasks: TaskWithDetails[] | null;
  workspace: Workspace;
}

export type TaskWithDetails = {
  id: string; // Required field for task selection
} & Partial<WorkspaceTask> & {
    board_name?: string;
    list_name?: string;
    ticket_prefix?: string | null;
  };

export interface FilterState {
  searchQuery: string;
  categoryId: string;
  duration: string;
  productivity: string;
  timeOfDay: string;
  projectContext: string;
  sessionQuality: string;
}

export interface ActionStates {
  [key: string]: boolean;
}

export interface EditFormState {
  title: string;
  description: string;
  categoryId: string;
  taskId: string;
  startTime: string;
  endTime: string;
}
