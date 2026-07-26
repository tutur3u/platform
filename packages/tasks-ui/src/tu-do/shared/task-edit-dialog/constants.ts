/**
 * Constants for task edit dialog
 */

// Debounce delay for Yjs update events (milliseconds)
export const DESCRIPTION_SYNC_DEBOUNCE_MS = 500;

// Width of suggestion menus (pixels)
export const SUGGESTION_MENU_WIDTH = 360;

// Name update debounce delay (milliseconds)
export const NAME_UPDATE_DEBOUNCE_MS = 1000;

// Draft save debounce delay (milliseconds)
export const DRAFT_SAVE_DEBOUNCE_MS = 300;

// Task search debounce delay (milliseconds)
export const TASK_SEARCH_DEBOUNCE_MS = 300;

/**
 * How long the task dialog will hold its loading skeleton while waiting for the
 * description's realtime document to settle. A stalled channel (offline, a
 * failed subscription) must never keep the content hidden, so the skeleton gives
 * up after this and shows whatever is available.
 */
export const MAX_DESCRIPTION_SETTLE_MS = 2500;
