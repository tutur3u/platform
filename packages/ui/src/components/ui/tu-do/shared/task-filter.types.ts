/**
 * Pure type definitions for task filtering system
 *
 * This module contains all type definitions related to task filtering.
 * It has zero runtime dependencies and exists solely for type safety.
 */

import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

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

export interface TaskFilters {
  labels: TaskLabel[];
  assignees: TaskAssignee[];
  projects: TaskProject[];
  priorities: TaskPriority[];
  dueDateRange: { from?: Date; to?: Date } | null;
  estimationRange: { min?: number; max?: number } | null;
  includeMyTasks: boolean;
  includeUnassigned: boolean;
  searchQuery?: string;
  sortBy?: SortOption;
}
