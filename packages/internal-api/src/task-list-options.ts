import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

export interface ListWorkspaceTasksOptions {
  boardId?: string;
  listId?: string;
  listStatuses?: string[];
  sourceScope?: TaskSourceScope;
  sourceWorkspaceIds?: string[];
  sourceBoardIds?: string[];
  q?: string;
  identifier?: string;
  limit?: number;
  offset?: number;
  labelIds?: string[];
  assigneeIds?: string[];
  projectIds?: string[];
  priorities?: TaskPriority[];
  estimationMin?: number;
  estimationMax?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  assignedToMe?: boolean;
  includeUnassigned?: boolean;
  completed?: 'exclude' | 'only';
  closed?: 'exclude' | 'only';
  hasDueDate?: boolean;
  externalIncludeDocuments?: boolean;
  externalIncludeDoneClosed?: boolean;
  externalSortBy?: ExternalTaskSortBy;
  sortBy?: SortOption;
  unprioritizedPosition?: 'first' | 'last';
  forTimeTracking?: boolean;
  includeRelationshipSummary?: boolean;
  includeArchivedBoards?: boolean;
  includeDeleted?: boolean | 'only';
  includeCount?: boolean;
  includeListCounts?: boolean;
}

export type ExternalTaskSortBy =
  | 'created-desc'
  | 'created-asc'
  | 'due-asc'
  | 'name-asc'
  | 'source-asc';

export type TaskSourceScope =
  | 'all_visible'
  | 'current_board'
  | 'external_current_workspace'
  | 'external_specific';

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
