import { createFileRoute, notFound } from '@tanstack/react-router';
import { ModuleViewer } from '../../../../../../components/share-course/module-viewer';
import { createPageHead } from '../../../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../../../lib/platform/messages';
import {
  loadSharedCourseContent,
  type SharedCourseContent,
} from '../../../../../../lib/platform/shared-course';

type SharedCourseModuleRouteParams = {
  locale: string;
  moduleId: string;
  resourceId: string;
  type: string;
};

type SharedCourseModuleLoaderData = {
  group: SharedCourseContent['group'];
  module: SharedCourseContent['modules'][number];
  moduleIndex: number;
  nextModuleId: string | null;
  previousModuleId: string | null;
  totalModules: number;
};

export const Route = createFileRoute(
  '/$locale/share/$type/$resourceId/modules/$moduleId'
)({
  component: SharedCourseModuleRoutePage,
  head: ({ params }) => {
    const { locale: routeLocale, type } =
      params as unknown as SharedCourseModuleRouteParams;
    const locale = resolveMessagesLocale(routeLocale);

    if (type !== 'course') {
      return createPageHead({
        locale,
        title: 'Shared Content',
      });
    }

    return createPageHead({
      description: 'View shared course module content.',
      locale,
      title: 'Course Module',
    });
  },
  loader: async ({ params }) => {
    const {
      moduleId = '',
      resourceId = '',
      type = '',
    } = params as Partial<SharedCourseModuleRouteParams>;

    if (type !== 'course') {
      throw notFound();
    }

    const sharedCourse = await loadSharedCourseContent({
      data: { resourceId },
    });

    if (!sharedCourse) {
      throw notFound();
    }

    const moduleIndex = sharedCourse.modules.findIndex(
      (module) => module.id === moduleId
    );

    if (moduleIndex === -1) {
      throw notFound();
    }

    const module = sharedCourse.modules[moduleIndex];

    if (!module) {
      throw notFound();
    }

    return {
      group: sharedCourse.group,
      module,
      moduleIndex: moduleIndex + 1,
      nextModuleId: sharedCourse.modules[moduleIndex + 1]?.id ?? null,
      previousModuleId: sharedCourse.modules[moduleIndex - 1]?.id ?? null,
      totalModules: sharedCourse.modules.length,
    };
  },
});

function SharedCourseModuleRoutePage() {
  const { locale, resourceId, type } =
    Route.useParams() as unknown as SharedCourseModuleRouteParams;
  const data = Route.useLoaderData() as SharedCourseModuleLoaderData;

  return (
    <ModuleViewer
      group={data.group}
      locale={locale}
      module={data.module}
      moduleIndex={data.moduleIndex}
      nextModuleId={data.nextModuleId}
      previousModuleId={data.previousModuleId}
      resourceId={resourceId}
      totalModules={data.totalModules}
      type={type}
    />
  );
}
