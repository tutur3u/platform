/**
 * Removal refusals that carry a stable response `code`, mapped to the
 * sentence the people screen shows for them.
 */
const REMOVAL_REFUSAL_TEXT = {
  WORKSPACE_CREATOR_PROTECTED: 'creator',
  WORKSPACE_LAST_MANAGER: 'lastManager',
} as const;

/**
 * Translated sentences for a failed removal. The screen that owns the
 * translator resolves them, so every key stays a literal next to its
 * `useTranslations` binding.
 */
export interface WorkspaceAccessRemovalErrorText {
  creator: string;
  fallback: string;
  lastManager: string;
}

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}

/**
 * The translated refusal for a known member or access-level removal code.
 */
export function getWorkspaceAccessRemovalRefusalMessage(
  error: unknown,
  text: Pick<WorkspaceAccessRemovalErrorText, 'creator' | 'lastManager'>
) {
  const code = errorCode(error);
  if (code && Object.hasOwn(REMOVAL_REFUSAL_TEXT, code)) {
    return text[
      REMOVAL_REFUSAL_TEXT[code as keyof typeof REMOVAL_REFUSAL_TEXT]
    ];
  }

  return null;
}

export function describeWorkspaceAccessRemovalError(
  error: unknown,
  text: WorkspaceAccessRemovalErrorText
) {
  return (
    getWorkspaceAccessRemovalRefusalMessage(error, text) ??
    (error instanceof Error ? error.message : text.fallback)
  );
}

/**
 * The translated sentence for a failed access-level or default-access save.
 * A save that would leave full members without a member manager answers
 * `WORKSPACE_LAST_MANAGER`, the same refusal a removal gives.
 */
export function describeWorkspaceAccessRoleSaveError(
  error: unknown,
  text: Pick<WorkspaceAccessRemovalErrorText, 'fallback' | 'lastManager'>
) {
  if (errorCode(error) === 'WORKSPACE_LAST_MANAGER') return text.lastManager;
  return error instanceof Error ? error.message : text.fallback;
}
