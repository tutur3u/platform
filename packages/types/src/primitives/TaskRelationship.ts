/**
 * Task Relationship Types
 *
 * This file defines the types for managing task relationships:
 * - parent_child: Sub-tasks / sub-issues (child can only have one parent)
 * - blocks: Task A blocks Task B (A must be completed before B can start)
 * - related: Related tasks (bidirectional relationship)
 */

/**
 * The type of relationship between two tasks
 */
export type TaskRelationshipType = 'parent_child' | 'blocks' | 'related';

/**
 * A relationship between two tasks
 */
export interface TaskRelationship {
  id: string;
  source_task_id: string;
  target_task_id: string;
  type: TaskRelationshipType;
  created_at: string;
  created_by: string | null;
}

/**
 * A task with minimal info for relationship display
 */
export interface RelatedTaskInfo {
  id: string;
  name: string;
  display_number?: number | null;
  completed?: boolean | null;
  priority?: 'low' | 'normal' | 'high' | 'critical' | null;
  board_id?: string | null;
  board_name?: string;
}

/**
 * Extended task interface with relationship data
 */
export interface TaskWithRelationships {
  id: string;
  name: string;
  display_number?: number | null;
  completed?: boolean | null;
  priority?: 'low' | 'normal' | 'high' | 'critical' | null;

  // Parent-child relationships
  parentTask?: RelatedTaskInfo | null;
  childTasks?: RelatedTaskInfo[];

  // Blocking relationships
  blockedBy?: RelatedTaskInfo[]; // Tasks that block this task
  blocking?: RelatedTaskInfo[]; // Tasks that this task blocks

  // Related tasks (informational)
  relatedTasks?: RelatedTaskInfo[];
}

/**
 * Input for creating a task relationship
 */
export interface CreateTaskRelationshipInput {
  source_task_id: string;
  target_task_id: string;
  type: TaskRelationshipType;
}

/**
 * Response from fetching task relationships
 */
export interface TaskRelationshipsResponse {
  parentTask: RelatedTaskInfo | null;
  childTasks: RelatedTaskInfo[];
  blockedBy: RelatedTaskInfo[];
  blocking: RelatedTaskInfo[];
  relatedTasks: RelatedTaskInfo[];
}

/**
 * Input for creating a task with a relationship in one atomic operation
 */
export interface CreateTaskWithRelationshipInput {
  /** Name of the new task to create */
  name: string;
  /** List ID where the task will be created */
  listId: string;
  /** The current task ID that the new task will be related to */
  currentTaskId: string;
  /** Type of relationship to create */
  relationshipType: TaskRelationshipType;
  /**
   * Whether the current task is the source of the relationship.
   * - For parent: false (new task is parent, current is child)
   * - For child/subtask: true (current task is parent, new is child)
   * - For blocks: true (current task blocks new task)
   * - For blocked-by: false (new task blocks current task)
   * - For related: true (direction doesn't matter for related)
   */
  currentTaskIsSource: boolean;
}

/**
 * RPC return type for create_task_with_relationship function
 * Strongly typed response ensuring task and relationship are properly structured
 */
export interface CreateTaskWithRelationshipResult {
  task: {
    id: string;
    name: string;
    description?: string | null;
    list_id: string;
    display_number: number;
    priority?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at: string;
    completed_at?: string | null;
    closed_at?: string | null;
    deleted_at?: string | null;
    estimation_points?: number | null;
    sort_key?: number | null;
    labels?: Array<{
      id: string;
      name: string;
      color: string;
      created_at: string;
    }>;
    assignees?: Array<{
      id: string;
      display_name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
      handle?: string | null;
    }>;
    projects?: Array<{
      id: string;
      name: string;
      status: string;
    }>;
  };
  relationship: TaskRelationship;
}
