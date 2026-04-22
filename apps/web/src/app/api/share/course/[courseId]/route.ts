import { z } from 'zod';
import { loadSharedCourseContent } from '@/lib/share/load-shared-course';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const parsedParams = RouteParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return Response.json(
        { error: 'Invalid route params', errors: parsedParams.error.issues },
        { status: 400 }
      );
    }

    const { courseId } = parsedParams.data;
    const sharedCourse = await loadSharedCourseContent(courseId, request);
    if (!sharedCourse) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }

    return Response.json({
      group: sharedCourse.group,
      modules: sharedCourse.modules,
    });
  } catch (error) {
    console.error('Failed to load shared course content', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
