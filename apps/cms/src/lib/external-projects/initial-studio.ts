import {
  getWorkspaceExternalProjectStudio,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { ExternalProjectStudioData } from '@tuturuuu/types';
import { headers } from 'next/headers';

/**
 * Loads the studio payload on the server so the editor renders with data
 * instead of fetching after mount. The call forwards the editor's own session
 * to the API, which applies the same authorization as a browser request, and
 * the response is never cached. Callers check workspace access first.
 *
 * Any failure resolves to `undefined`: the client then fetches the payload
 * itself and surfaces the error through its normal query state.
 */
export async function loadInitialCmsStudio(
  workspaceId: string
): Promise<ExternalProjectStudioData | undefined> {
  try {
    const { binding: _binding, ...studio } =
      await getWorkspaceExternalProjectStudio(
        workspaceId,
        withForwardedInternalApiAuth(await headers())
      );

    return studio;
  } catch {
    return undefined;
  }
}
