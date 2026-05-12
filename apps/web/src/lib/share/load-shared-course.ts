import {
  getSharedCourseContent,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { SharedCourseGroup, SharedCourseModule } from '@tuturuuu/types';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { headers } from 'next/headers';
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
  request?: Request
): Promise<SharedCourseContent | null> {
  if (!validateUuid(groupId)) {
    return null;
  }

  const requestHeaders = request?.headers ?? (await headers());
  const options = withForwardedInternalApiAuth(requestHeaders);

  try {
    const sharedCourse = await getSharedCourseContent(groupId, options);
    return {
      group: {
        description: sharedCourse.group.description,
        name: sharedCourse.group.name ?? '',
      },
      modules: sharedCourse.modules.map((courseModule) => ({
        ...courseModule,
        content: courseModule.content as JSONContent | null,
        extra_content:
          courseModule.extra_content as SharedCourseModule['extra_content'],
        name: courseModule.name ?? '',
        sort_key: courseModule.sort_key ?? 0,
      })),
    };
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      [401, 403, 404].includes(error.status)
    ) {
      return null;
    }
    throw error;
  }
}
