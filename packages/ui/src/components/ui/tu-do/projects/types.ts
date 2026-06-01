import type { TaskProjectLinkedItem } from '@tuturuuu/internal-api/tasks';
import type { TaskProjectWithRelations } from '@tuturuuu/types';

export type ProjectStatus =
  | 'backlog'
  | 'planned'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'cancelled'
  | 'active'
  | 'on_hold';

export type ProjectPriority = 'critical' | 'high' | 'normal' | 'low';

export type ProjectHealth = 'on_track' | 'at_risk' | 'off_track';

export type LinkedTask = TaskProjectLinkedItem;

export interface TaskProject extends TaskProjectWithRelations {
  status: ProjectStatus | null;
  priority: ProjectPriority | null;
  health_status: ProjectHealth | null;
  tasksCount: number;
  completedTasksCount: number;
  linkedTasks: LinkedTask[];
  linkedDocuments: LinkedTask[];
}

export interface TaskProjectsClientProps {
  wsId: string;
  initialProjects: TaskProject[];
}

export interface TaskOption {
  id: string;
  name: string;
  completed_at: string | null;
  listName: string | null;
}

export type ViewMode = 'grid' | 'list';
export type SortBy =
  | 'created_at'
  | 'name'
  | 'status'
  | 'priority'
  | 'health_status'
  | 'tasks_count';
export type SortOrder = 'asc' | 'desc';

export interface ProjectOperationsStats {
  totalProjects: number;
  activeProjects: number;
  linkedTasks: number;
  linkedDocuments: number;
  completedTasks: number;
  atRiskProjects: number;
}
