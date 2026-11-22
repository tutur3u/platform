/**
 * Removal refusals that carry a stable response `code`, mapped to the
 * translated sentence the people screen shows for them.
 */
const REMOVAL_REFUSAL_KEYS: Record<string, string> = {
  WORKSPACE_CREATOR_PROTECTED: 'ws-members.creator_removal_refused',
  WORKSPACE_LAST_MANAGER: 'ws-members.last_manager_removal_refused',
};

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
  t: (key: string) => string
) {
  const code = errorCode(error);
  if (code && Object.hasOwn(REMOVAL_REFUSAL_KEYS, code)) {
    return t(REMOVAL_REFUSAL_KEYS[code]!);
  }

  return error instanceof Error ? error.message : t('common.error');
}
