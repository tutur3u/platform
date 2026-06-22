import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getSharedCourseContent,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { SharedCourseGroup, SharedCourseModule } from '@tuturuuu/types';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { z } from 'zod';

export interface SharedCourseContent {
  group: SharedCourseGroup;
  modules: SharedCourseModule[];
}

const sharedCourseRequestSchema = z.object({
  resourceId: z.uuid(),
});

export const loadSharedCourseContent = createServerFn({ method: 'GET' })
  .validator((data: { resourceId: string }) => {
    const result = sharedCourseRequestSchema.safeParse({
      resourceId: data.resourceId.trim(),
    });

    return result.success ? result.data : null;
  })
  .handler(async ({ data }): Promise<SharedCourseContent | null> => {
    if (!data) {
      return null;
    }

    try {
      const sharedCourse = await getSharedCourseContent(
        data.resourceId,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

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
  });
