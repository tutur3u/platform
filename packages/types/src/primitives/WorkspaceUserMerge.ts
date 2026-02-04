/**
 * Types for workspace user duplicate detection and merging
 */

/**
 * Represents a single user within a duplicate cluster
 */
export interface DuplicateUser {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  isLinked: boolean;
  linkedPlatformUserId: string | null;
  createdAt: string;
}

/**
 * Represents a cluster of duplicate users
 * Users are grouped by matching email or phone number
 */
export interface DuplicateCluster {
  clusterId: number;
  matchReason: 'email' | 'phone' | 'both';
  users: DuplicateUser[];
  /** The suggested target user ID (linked user or oldest user) */
  suggestedTargetId: string;
}

/**
 * Details about a collision during merge (records deleted due to composite PK conflict)
 */
export interface CollisionDetail {
  /** The table where collision occurred */
  table: string;
  /** Number of records deleted */
  deleted_count: number;
  /** The PK column that caused the collision */
  pk_column: string;
  /** Values of the deleted records' PK column (for recovery assessment) */
  deleted_pk_values: string[];
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  success: boolean;
  error?: string;
  sourceUserId: string;
  targetUserId: string;
  /** Tables where records were migrated from source to target */
  migratedTables: string[];
  /** Tables where collision records were deleted */
  collisionTables: string[];
  /** Detailed information about collisions for recovery assessment */
  collisionDetails?: CollisionDetail[];
  /** Number of custom field values merged */
  customFieldsMerged: number;
  /** When both users are linked to different platform accounts (error case) */
  sourcePlatformUserId?: string;
  targetPlatformUserId?: string;
}

/**
 * Response from the duplicate detection API
 */
export interface DuplicateDetectionResponse {
  clusters: DuplicateCluster[];
  totalDuplicates: number;
}

/**
 * Request body for merge operation
 */
export interface MergeUsersRequest {
  sourceId: string;
  targetId: string;
}

/**
 * Request body for bulk merge operation
 */
export interface BulkMergeUsersRequest {
  merges: MergeUsersRequest[];
}

/**
 * Response from bulk merge operation
 */
export interface BulkMergeUsersResponse {
  results: MergeResult[];
  successCount: number;
  failCount: number;
}
