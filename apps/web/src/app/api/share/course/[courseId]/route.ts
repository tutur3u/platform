import { loadSharedCourseContent } from '@/lib/share/load-shared-course';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
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
