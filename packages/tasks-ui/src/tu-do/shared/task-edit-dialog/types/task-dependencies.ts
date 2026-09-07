import type {
  RelatedTaskInfo,
  TaskRelationshipsResponse,
} from '@tuturuuu/types/primitives/TaskRelationship';
import type { PendingTaskRelationships } from './pending-relationship';

export interface UseTaskDependenciesProps {
  taskId?: string;
  boardId: string;
  wsId: string;
  listId?: string;
  isCreateMode: boolean;
  isOpen?: boolean;
  initialPendingRelationships?: PendingTaskRelationships;
  onUpdate?: () => void;
}

export interface UseTaskDependenciesReturn {
  // Data
  relationships: TaskRelationshipsResponse | null | undefined;
  isLoading: boolean;

  // Parent task
  parentTask: RelatedTaskInfo | null;
  setParentTask: (task: RelatedTaskInfo | null) => Promise<void>;
  createParentTask: (name: string) => Promise<void>;

  // Child tasks
  childTasks: RelatedTaskInfo[];
  addChildTask: (task: RelatedTaskInfo) => Promise<void>;
  removeChildTask: (taskId: string) => Promise<void>;

  // Blocking relationships
  blocking: RelatedTaskInfo[];
  addBlockingTask: (task: RelatedTaskInfo) => Promise<void>;
  removeBlockingTask: (taskId: string) => Promise<void>;
  createBlockingTask: (name: string) => Promise<void>;

  // Blocked by relationships
  blockedBy: RelatedTaskInfo[];
  addBlockedByTask: (task: RelatedTaskInfo) => Promise<void>;
  removeBlockedByTask: (taskId: string) => Promise<void>;
  createBlockedByTask: (name: string) => Promise<void>;

  // Related tasks
  relatedTasks: RelatedTaskInfo[];
  addRelatedTask: (task: RelatedTaskInfo) => Promise<void>;
  removeRelatedTask: (taskId: string) => Promise<void>;
  createRelatedTask: (name: string) => Promise<void>;

  // Loading states
  savingRelationship: string | null;
  pendingRelationships: PendingTaskRelationships;
}
