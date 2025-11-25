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
