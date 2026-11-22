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
 * The toast text for a failed member or access-level removal: the translated
 * refusal for a known response code, otherwise the error's own message.
 */
export function describeWorkspaceAccessRemovalError(
  error: unknown,
  text: WorkspaceAccessRemovalErrorText
) {
  const code = errorCode(error);
  if (code && Object.hasOwn(REMOVAL_REFUSAL_TEXT, code)) {
    return text[
      REMOVAL_REFUSAL_TEXT[code as keyof typeof REMOVAL_REFUSAL_TEXT]
    ];
  }

  return error instanceof Error ? error.message : text.fallback;
}
