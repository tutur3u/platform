import type { WorkspaceUser } from './WorkspaceUser';

/**
 * Represents a group of workspace users with duplicate email or phone
 */
export interface DuplicateGroup {
  /** The normalized duplicate value (lowercase email or digits-only phone) */
  duplicateKey: string;
  /** Which field has the duplicate: 'email' or 'phone' */
  duplicateField: 'email' | 'phone';
  /** Array of user IDs in this duplicate group */
  userIds: string[];
  /** Full user objects for comparison */
  users: WorkspaceUser[];
}

/**
 * Response from the duplicates detection API
 */
export interface DuplicatesResponse {
  /** All duplicate groups found */
  duplicates: DuplicateGroup[];
  /** Total number of duplicate groups */
  totalGroups: number;
  /** Number of groups with duplicate emails */
  emailGroups: number;
  /** Number of groups with duplicate phones */
  phoneGroups: number;
}

/**
 * Affected record counts per table and column
 */
export interface AffectedRecords {
  [tableName: string]: {
    [columnName: string]: number;
  };
}

/**
 * Preview data for a merge operation
 */
export interface MergePreview {
  /** The user that will be kept */
  keepUser: WorkspaceUser;
  /** The user that will be deleted */
  deleteUser: WorkspaceUser;
  /** Count of affected records per table/column */
  affectedRecords: AffectedRecords;
  /** Total number of records that will be updated */
  totalAffectedRecords: number;
  /** Warning messages about the merge */
  warnings: string[];
}

/**
 * Result of a successful merge operation
 */
export interface MergeResult {
  /** Whether the merge was successful */
  success: boolean;
  /** Error message if merge failed */
  error?: string;
  /** Number of records updated per table/column */
  updates: AffectedRecords;
  /** ID of the kept user */
  mergedUserId: string;
  /** ID of the deleted user */
  deletedUserId: string;
  /** Fields that were copied from the deleted user */
  fieldsFromDeleted?: string[];
  /** Balance strategy used */
  balanceStrategy?: 'keep' | 'add';
}

/**
 * Strategy for which user's field value to keep during merge
 * 'keep' = use value from keep_user
 * 'delete' = use value from delete_user
 */
export type FieldStrategy = Record<string, 'keep' | 'delete'>;

/**
 * Strategy for handling user balance during merge
 * 'keep' = use keep_user's balance
 * 'add' = sum both users' balances
 */
export type BalanceStrategy = 'keep' | 'add';

/**
 * Request body for a single merge operation
 */
export interface MergeRequest {
  /** ID of the user to keep */
  keepUserId: string;
  /** ID of the user to delete */
  deleteUserId: string;
  /** Strategy for each field */
  fieldStrategy?: FieldStrategy;
  /** Strategy for handling balance */
  balanceStrategy?: BalanceStrategy;
}

/**
 * A pair of users to merge in bulk operations
 */
export interface BulkMergePair {
  /** ID of the user to keep */
  keepUserId: string;
  /** ID of the user to delete */
  deleteUserId: string;
}

/**
 * Preview information for a single pair in bulk merge
 */
export interface BulkMergePairPreview {
  /** The user that will be kept */
  keepUser: WorkspaceUser;
  /** The user that will be deleted */
  deleteUser: WorkspaceUser;
  /** Total affected records for this pair */
  affectedRecords: number;
}

/**
 * Preview data for a bulk merge operation
 */
export interface BulkMergePreview {
  /** Preview for each merge pair */
  pairs: BulkMergePairPreview[];
  /** Total records affected across all merges */
  totalAffectedRecords: number;
  /** Aggregated warnings */
  warnings: string[];
}

/**
 * Result for a single merge in bulk operation
 */
export interface BulkMergePairResult {
  /** ID of the user that was kept */
  keepUserId: string;
  /** ID of the user that was deleted */
  deleteUserId: string;
  /** Whether this merge was successful */
  success: boolean;
  /** Error message if this merge failed */
  error?: string;
}

/**
 * Result of a bulk merge operation
 */
export interface BulkMergeResult {
  /** Overall success (all merges succeeded) */
  success: boolean;
  /** Results for each individual merge */
  results: BulkMergePairResult[];
  /** Number of successful merges */
  successCount: number;
  /** Number of failed merges */
  failureCount: number;
}

/**
 * Request body for bulk merge preview
 */
export interface BulkMergePreviewRequest {
  /** Array of user pairs to preview merging */
  pairs: BulkMergePair[];
}

/**
 * Request body for bulk merge execution
 */
export interface BulkMergeRequest {
  /** Array of user pairs to merge */
  pairs: BulkMergePair[];
  /** Balance strategy to apply to all merges */
  balanceStrategy?: BalanceStrategy;
}

/**
 * Auto-selection strategy for bulk merges
 * 'oldest' = keep the user with earliest created_at
 * 'newest' = keep the user with latest created_at
 * 'most_data' = keep the user with most non-null fields
 */
export type AutoSelectStrategy = 'oldest' | 'newest' | 'most_data';
