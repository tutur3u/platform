/**
 * Relationship types for creating tasks with relationships
 *
 * These types define how new tasks can be related to existing tasks during creation.
 * - subtask: New task will be a subtask of relatedTaskId
 * - parent: New task will be the parent of relatedTaskId
 * - blocking: New task will be blocked by relatedTaskId (relatedTask blocks newTask)
 * - blocked-by: New task will block relatedTaskId (newTask blocks relatedTask)
 * - related: New task will be related to relatedTaskId
 */
export type PendingRelationshipType =
  | 'subtask'
  | 'parent'
  | 'blocking'
  | 'blocked-by'
  | 'related';

/**
 * Pending relationship object containing type and related task information
 */
export interface PendingRelationship {
  type: PendingRelationshipType;
  relatedTaskId: string;
  relatedTaskName: string;
}
