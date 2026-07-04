import type { MigrationModule } from '../modules';

export type DataSource = 'external' | 'internal';

export type MigrationStage =
  | 'external'
  | 'internal'
  | 'reconciling'
  | 'syncing'
  | null;

export interface ModuleState {
  externalData: unknown[] | null;
  internalData: unknown[] | null;
  existingInternalData: unknown[] | null;
  externalTotal: number;
  internalTotal: number;
  existingInternalTotal: number;
  loading: boolean;
  paused: boolean;
  completed: boolean;
  error: unknown | null;
  /** Total duplicates detected during reconciliation */
  duplicates: number;
  /** Records that have changes and need updating */
  updates: number;
  /** New records that don't exist in target */
  newRecords: number;
  /**
   * Count of records to actually sync (new + updates).
   * When skipDuplicates is enabled, this is less than externalTotal.
   */
  recordsToSync: number;
  stage: MigrationStage;
}

export type MigrationData = {
  [key in MigrationModule]?: ModuleState;
};

export interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  action: () => void;
}

export const DEFAULT_MODULE_STATE: ModuleState = {
  externalData: null,
  internalData: null,
  existingInternalData: null,
  externalTotal: 0,
  internalTotal: 0,
  existingInternalTotal: 0,
  loading: false,
  paused: false,
  completed: false,
  error: null,
  duplicates: 0,
  updates: 0,
  newRecords: 0,
  recordsToSync: 0,
  stage: null,
};
