import type { SharedCourseGroup, SharedCourseModule } from '@tuturuuu/types';
import { headers } from 'next/headers';
import {
  getConfiguredInternalApiBaseUrl,
  withForwardedInternalApiAuth,
  createInternalApiClient,
} from '@tuturuuu/internal-api';
import { validate as validateUuid } from 'uuid';

interface SharedCourseContent {
  group: SharedCourseGroup;
  modules: SharedCourseModule[];
}

/**
 * Loads shared course content by calling the centralized `/api/v1/course` route.
 * This keeps all DB fetching in the route handler so satellite apps (learn, etc.)
 * can consume the same endpoint via internal-api.
 */
export async function loadSharedCourseContent(
  groupId: string,
  _request?: Request
): Promise<SharedCourseContent | null> {
  if (!validateUuid(groupId)) {
    return null;
  }

  const requestHeaders = await headers();
  const options = withForwardedInternalApiAuth(requestHeaders);
  const client = createInternalApiClient(options);

  const baseUrl = getConfiguredInternalApiBaseUrl();
  const url = `${baseUrl}/api/v1/course?courseId=${encodeURIComponent(groupId)}`;

  const response = await client.fetch(url, { cache: 'no-store' });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load shared course content: ${response.status}`
    );
  }

  return (await response.json()) as SharedCourseContent;
}
