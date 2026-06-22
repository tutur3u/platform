import { createFileRoute, notFound } from '@tanstack/react-router';
import { CourseViewer } from '../../../../components/share-course/course-viewer';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  loadSharedCourseContent,
  type SharedCourseContent,
} from '../../../../lib/platform/shared-course';

type SharedCourseRouteParams = {
  locale: string;
  resourceId: string;
  type: string;
};

export const Route = createFileRoute('/$locale/share/$type/$resourceId')({
  component: SharedCourseRoutePage,
  head: ({ params }) => {
    const { locale: routeLocale, type } =
      params as unknown as SharedCourseRouteParams;
    const locale = resolveMessagesLocale(routeLocale);

    if (type !== 'course') {
      return createPageHead({
        locale,
        title: 'Shared Content',
      });
    }

    return createPageHead({
      description: 'View shared course content.',
      locale,
      title: 'Course Content',
    });
  },
  loader: async ({ params }) => {
    const { resourceId = '', type = '' } =
      params as Partial<SharedCourseRouteParams>;

    if (type !== 'course') {
      throw notFound();
    }

    const sharedCourse = await loadSharedCourseContent({
      data: { resourceId },
    });

    if (!sharedCourse) {
      throw notFound();
    }

    return sharedCourse;
  },
});

function SharedCourseRoutePage() {
  const { locale, resourceId, type } =
    Route.useParams() as unknown as SharedCourseRouteParams;
  const sharedCourse = Route.useLoaderData() as SharedCourseContent;

  return (
    <CourseViewer
      group={sharedCourse.group}
      locale={locale}
      modules={sharedCourse.modules}
      resourceId={resourceId}
      type={type}
    />
  );
}
