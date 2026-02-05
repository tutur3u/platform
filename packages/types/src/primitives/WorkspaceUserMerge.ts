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

/**
 * Request body for phased merge operation
 * Allows resuming from a specific table/phase if a previous attempt timed out
 */
export interface PhasedMergeRequest {
  sourceId: string;
  targetId: string;
  /**
   * Starting table index (0-25). Default is 0. Use for resuming after timeout.
   * There are 26 table/column pairs in phase 1, then phases 2-5 for finalization.
   */
  startTableIndex?: number;
}

/**
 * Result of a single phase execution
 */
export interface PhaseResult {
  success: boolean;
  phase: number;
  error?: string;
  message?: string;
  migrated_tables?: string[];
  migrated_count?: number;
  collision_tables?: string[];
  collision_details?: CollisionDetail[];
  custom_fields_merged?: number;
  link_transferred?: boolean;
  source_deleted?: boolean;
  source_platform_user_id?: string;
  target_platform_user_id?: string;
}

/**
 * Result of a phased merge operation
 * Extends MergeResult with phase-specific information for progress tracking and resumption
 */
export interface PhasedMergeResult extends MergeResult {
  /** Last successfully completed phase (0-5) */
  completedPhase: number;
  /** Next phase to run if partial (only present if partial=true) */
  nextPhase?: number;
  /** True if merge was interrupted before completion */
  partial: boolean;
  /** Detailed results from each phase that was executed */
  phaseResults?: PhaseResult[];
  /** Last completed table index during phase 1 (0-25) */
  completedTableIndex?: number;
  /** Next table index to process if timed out during phase 1 */
  nextTableIndex?: number;
  /** Current table being processed when timeout occurred */
  currentTable?: string;
  /** Current column being processed when timeout occurred */
  currentColumn?: string;
  /** Total rows updated across all operations */
  totalRowsUpdated?: number;
}
