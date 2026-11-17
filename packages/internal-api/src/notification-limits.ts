/**
 * Bounds shared by the notification read-state routes, their client helpers
 * and the database restore function.
 *
 * Request bodies must fit the smallest proxy body cap on any notification
 * transport: the Colab platform bridge refuses bodies over 32,000 bytes.
 */
export const NOTIFICATION_BRIDGE_BODY_LIMIT = 32_000;

/**
 * Most rows one Undo may restore, and most rows a mark-all reports as
 * undoable. A restore body of this many id/revision UUID pairs serializes to
 * 31,249 bytes, under NOTIFICATION_BRIDGE_BODY_LIMIT. Larger mark-alls still
 * succeed but offer no Undo; they are never truncated or partially undone.
 */
export const NOTIFICATION_RESTORE_LIMIT = 400;
