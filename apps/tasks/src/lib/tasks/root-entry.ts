import {
  getCurrentUserDefaultWorkspace,
  getUserConfig,
  type withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { resolveTaskBoardEntrypoint } from './task-board-entrypoint';

/** Query flags that keep a root request from opening a board. */
const ROOT_REDIRECT_EXCLUSIONS = ['no-redirect', 'hash-nav', 'multiAccount'];

export function isRootRedirectExcluded(search: URLSearchParams) {
  return ROOT_REDIRECT_EXCLUSIONS.some((flag) => search.has(flag));
}

/**
 * Where an authenticated request for the app root (`/` or `/<locale>`) goes:
 * the preferred workspace (`TASKS_FORCE_DEFAULT_WORKSPACE_REDIRECT`, else
 * personal) and its entry board, keeping the query. Without a board, the
 * caller renders the localized task entrypoint instead. Shared by `proxy.ts`
 * (document requests) and the native page loader (client navigation), so
 * both reach the same destination. Paths are app-relative.
 */
export async function resolveTasksRootEntry({
  auth,
  locale,
  localePrefixed,
  search,
}: {
  auth: ReturnType<typeof withForwardedInternalApiAuth>;
  locale: string;
  /** Whether the request path carried the locale (`/vi`). */
  localePrefixed: boolean;
  /** Including the leading `?`, or empty. */
  search: string;
}): Promise<
  | { kind: 'board'; target: string; path: string }
  | { kind: 'entrypoint'; target: string; path: string }
> {
  let target = 'personal';

  try {
    const config = await getUserConfig(
      'TASKS_FORCE_DEFAULT_WORKSPACE_REDIRECT',
      auth
    );

    if (config?.value === 'true') {
      const defaultWorkspace = await getCurrentUserDefaultWorkspace(auth);

      if (defaultWorkspace) {
        target = defaultWorkspace.personal
          ? 'personal'
          : defaultWorkspace.id === ROOT_WORKSPACE_ID
            ? 'internal'
            : defaultWorkspace.id;
      }
    }
  } catch (error) {
    console.warn(
      'Could not resolve the preferred Tasks workspace; using personal:',
      error
    );
  }

  try {
    const boardId = await resolveTaskBoardEntrypoint(target, auth, { locale });

    if (boardId) {
      const localePrefix = localePrefixed ? `/${locale}` : '';
      return {
        kind: 'board',
        target,
        path: `${localePrefix}/${target}/boards/${boardId}${search}`,
      };
    }
  } catch (error) {
    console.warn(
      'Could not resolve the Tasks board at the app root; using the task entrypoint:',
      error
    );
  }

  // The localized App Router pathname, as next-intl would rewrite it.
  return {
    kind: 'entrypoint',
    target,
    path: `/${locale}/${target}/tasks${search}`,
  };
}
