import { TASK_BOARD_PINNED_SPECIAL_LISTS_CONFIG_ID } from '@tuturuuu/internal-api/users';
import {
  TASK_AUTO_COLLAPSE_EMPTY_LISTS_CONFIG_ID,
  TASK_HIDE_EMPTY_LISTS_CONFIG_ID,
  TASK_PERSIST_COLLAPSED_LISTS_CONFIG_ID,
} from './task-board-preferences';

/**
 * User configs the kanban waits for before its first paint, with the value
 * each one takes when the user has not stored it.
 */
export const BOARD_USER_CONFIG_DEFAULTS = {
  [TASK_PERSIST_COLLAPSED_LISTS_CONFIG_ID]: 'true',
  [TASK_HIDE_EMPTY_LISTS_CONFIG_ID]: 'false',
  [TASK_AUTO_COLLAPSE_EMPTY_LISTS_CONFIG_ID]: 'false',
} as const;

/** Per-workspace user configs the kanban waits for (default: no value). */
export const BOARD_WORKSPACE_CONFIG_IDS = [
  TASK_BOARD_PINNED_SPECIAL_LISTS_CONFIG_ID,
] as const;

/**
 * Stored values read with the board during the server render, keyed by
 * config id. A present key with `null` means the user has no stored value; a
 * missing key was not read and loads in the browser.
 */
export interface BoardPreferenceSeed {
  userConfigs: Record<string, string | null>;
  workspaceConfigs: Record<string, string | null>;
}
