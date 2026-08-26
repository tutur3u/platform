/**
 * Realtime channel naming and payload shapes for form studio collaboration.
 *
 * Kept free of React and of the Supabase client so both the hook and any
 * server-side broadcaster can share one definition of the wire format — a
 * mismatch here is invisible until two clients disagree at runtime.
 */

export const FORM_STUDIO_CHANNEL_PREFIX = 'form-studio-';

/**
 * Must stay in step with `private.can_join_form_realtime_topic`, which parses
 * the form id out of this exact prefix.
 */
export function getFormStudioChannelName(formId: string) {
  return `${FORM_STUDIO_CHANNEL_PREFIX}${formId}`;
}

export interface FormCollaboratorIdentity {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface FormCollaboratorPresence {
  user: FormCollaboratorIdentity;
  /**
   * Distinguishes two tabs belonging to the same person. Presence is keyed by
   * user id so one person shows as one avatar, but the block they are editing
   * is per-tab.
   */
  sessionId: string;
  /** Block currently focused, or null when the editor is idle. */
  blockId: string | null;
  /** Human-readable label for the focused block, for the tooltip. */
  blockLabel: string | null;
  /** True while the tab is hidden, so the avatar can dim instead of vanishing. */
  away: boolean;
  onlineAt: string;
}

export const FORM_STUDIO_EVENTS = {
  /** A collaborator persisted the form; other editors should refetch. */
  saved: 'form:saved',
} as const;

export interface FormSavedBroadcast {
  formId: string;
  actorId: string;
  actorName: string;
  savedAt: string;
}
