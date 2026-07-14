/**
 * Pure type definitions for task filtering system
 *
 * This module contains all type definitions related to task filtering.
 * It has zero runtime dependencies and exists solely for type safety.
 */

import type { TaskLabelSummary } from '@tuturuuu/types/db';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { ListStatusFilter } from './board-header';

export type TaskLabel = TaskLabelSummary;

export interface TaskAssignee {
  id: string;
  display_name: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

export interface TaskProject {
  id: string;
  name: string;
}

export type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'priority-high'
  | 'priority-low'
  | 'due-date-asc'
  | 'due-date-desc'
  | 'created-date-desc'
  | 'created-date-asc'
  | 'estimation-high'
  | 'estimation-low';

export type TaskSourceScope =
  | 'all_visible'
  | 'current_board'
  | 'external_current_workspace'
  | 'external_specific';

export interface TaskFilters {
  labels: TaskLabel[];
  assignees: TaskAssignee[];
  projects: TaskProject[];
  priorities: TaskPriority[];
  dueDateRange: { from?: Date; to?: Date } | null;
  estimationRange: { min?: number; max?: number } | null;
  includeMyTasks: boolean;
  includeUnassigned: boolean;
  hideEmptyTaskLists?: boolean;
  sourceScope: TaskSourceScope;
  sourceWorkspaceIds: string[];
  sourceBoardIds: string[];
  searchQuery?: string;
  sortBy?: SortOption;
}

export interface BoardFiltersMetadata {
  /** List status filter (all, active, not_started) */
  listStatusFilter: ListStatusFilter;
  /** Active task filters */
  filters: TaskFilters;
}
