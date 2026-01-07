import type { RelatedTaskInfo } from '@tuturuuu/types/primitives/TaskRelationship';

// Shared tab color variant type
export type TabColorVariant = 'purple' | 'green' | 'red' | 'blue';

// Tab types for relationship sections
export type RelationshipTab =
  | 'parent'
  | 'subtasks'
  | 'dependencies'
  | 'related';
export type DependencySubTab = 'blocks' | 'blocked-by';

// Props for the main TaskRelationshipsProperties component
export interface TaskRelationshipsPropertiesProps {
  wsId: string;
  taskId?: string;
  boardId: string;
  listId?: string;
  isCreateMode: boolean;

  // Data
  parentTask: RelatedTaskInfo | null;
  childTasks: RelatedTaskInfo[];
  blockingTasks: RelatedTaskInfo[];
  blockedByTasks: RelatedTaskInfo[];
  relatedTasks: RelatedTaskInfo[];
  isLoading: boolean;

  // Actions
  onSetParent: (task: RelatedTaskInfo) => void;
  onRemoveParent: () => void;
  onAddBlockingTask: (task: RelatedTaskInfo) => void;
  onRemoveBlockingTask: (taskId: string) => void;
  onAddBlockedByTask: (task: RelatedTaskInfo) => void;
  onRemoveBlockedByTask: (taskId: string) => void;
  onAddRelatedTask: (task: RelatedTaskInfo) => void;
  onRemoveRelatedTask: (taskId: string) => void;

  // Navigation
  onNavigateToTask: (taskId: string) => void;

  // Subtask creation (opens dialog)
  onAddSubtask?: () => void;

  // Dialog-based task creation handlers (opens task creation dialog with pending relationship)
  onAddParentTask?: () => void;
  onAddBlockingTaskDialog?: () => void;
  onAddBlockedByTaskDialog?: () => void;
  onAddRelatedTaskDialog?: () => void;

  // Add existing task as relationship
  onAddExistingAsSubtask?: (task: RelatedTaskInfo) => Promise<void>;

  // Saving state
  isSaving: boolean;
  savingTaskId?: string | null;
  disabled?: boolean;
}

// Props for TabButton component
export interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  color: TabColorVariant;
}

// Props for ClickableTaskItem component
export interface ClickableTaskItemProps {
  task: RelatedTaskInfo;
  onNavigateToTask: (taskId: string) => void;
  onRemove?: () => void;
  isSaving: boolean;
  isRemoving?: boolean;
  showRemove?: boolean;
  disabled?: boolean;
}

// Props for TaskSearchPopoverContent component
export interface TaskSearchPopoverContentProps {
  wsId: string;
  excludeTaskIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (task: RelatedTaskInfo) => void;
  onCreateNew?: (name: string) => Promise<void>;
  emptyText: string;
  isSaving: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  disabled?: boolean;
}

// Props for TaskSearchPopover component (with trigger)
export interface TaskSearchPopoverProps {
  wsId: string;
  excludeTaskIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (task: RelatedTaskInfo) => void;
  onCreateNew?: (name: string) => Promise<void>;
  placeholder?: string;
  emptyText: string;
  isSaving: boolean;
  disabled?: boolean;
}

// Props for ParentSection component
export interface ParentSectionProps {
  wsId: string;
  taskId?: string;
  parentTask: RelatedTaskInfo | null;
  childTaskIds: string[];
  isSaving: boolean;
  savingTaskId?: string | null;
  onSetParent: (task: RelatedTaskInfo) => void;
  onRemoveParent: () => void;
  onNavigateToTask: (taskId: string) => void;
  onAddParentTask?: () => void; // Opens dialog to create new parent task
  disabled?: boolean;
}

// Props for SubtasksSection component
export interface SubtasksSectionProps {
  wsId: string;
  taskId?: string;
  boardId: string;
  listId?: string;
  childTasks: RelatedTaskInfo[];
  onNavigateToTask: (taskId: string) => void;
  onAddSubtask?: () => void;
  onAddExistingAsSubtask?: (task: RelatedTaskInfo) => Promise<void>;
  isSaving: boolean;
  disabled?: boolean;
}

// Props for SubtaskActionButtons component
export interface SubtaskActionButtonsProps {
  wsId: string;
  excludeIds: string[];
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  onAddSubtask?: () => void;
  onAddExistingAsSubtask?: (task: RelatedTaskInfo) => Promise<void>;
  isSaving: boolean;
  disabled?: boolean;
}

// Props for DependenciesSection component
export interface DependenciesSectionProps {
  wsId: string;
  taskId?: string;
  blockingTasks: RelatedTaskInfo[];
  blockedByTasks: RelatedTaskInfo[];
  isSaving: boolean;
  savingTaskId?: string | null;
  onAddBlocking: (task: RelatedTaskInfo) => void;
  onRemoveBlocking: (taskId: string) => void;
  onAddBlockedBy: (task: RelatedTaskInfo) => void;
  onRemoveBlockedBy: (taskId: string) => void;
  onNavigateToTask: (taskId: string) => void;
  onAddBlockingTaskDialog?: () => void; // Opens dialog to create new blocking task
  onAddBlockedByTaskDialog?: () => void; // Opens dialog to create new blocked-by task
  disabled?: boolean;
}

// Props for RelatedSection component
export interface RelatedSectionProps {
  wsId: string;
  taskId?: string;
  relatedTasks: RelatedTaskInfo[];
  isSaving: boolean;
  savingTaskId?: string | null;
  onAddRelated: (task: RelatedTaskInfo) => void;
  onRemoveRelated: (taskId: string) => void;
  onNavigateToTask: (taskId: string) => void;
  onAddRelatedTaskDialog?: () => void; // Opens dialog to create new related task;
  disabled?: boolean;
}
