import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Goal, Sparkles } from '@tuturuuu/icons';
import {
  listWorkspaceCourseModules,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { useTranslations } from 'use-intl';
import { ModuleContentEditor } from '@/components/education/course-module-content/content-editor';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type ModuleContentData = {
  content: JSONContent | null;
  courseId: string;
  moduleId: string;
  workspaceId: string;
};

const loadModuleContent = createServerFn({ method: 'GET' })
  .validator(
    (data: { courseId: string; moduleId: string; wsId: string }) => data
  )
  .handler(
    async ({ data }): Promise<{ content: JSONContent | null } | null> => {
      const modules = await listWorkspaceCourseModules(
        data.wsId,
        data.courseId,
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      const module = modules.find((item) => item.id === data.moduleId);
      if (!module) {
        return null;
      }

      return { content: (module.content ?? null) as JSONContent | null };
    }
  );

export const Route = createFileRoute(
  '/$locale/$wsId/education/courses/$courseId/modules/$moduleId/content'
)({
  component: ModuleContentRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Content in the Module area of your Tuturuuu workspace.',
      locale,
      title: 'Content',
    });
  },
  loader: async ({ params }): Promise<ModuleContentData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/courses/${params.courseId}/modules/${params.moduleId}/content`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const result = await loadModuleContent({
      data: {
        courseId: params.courseId,
        moduleId: params.moduleId,
        wsId: workspace.workspaceId,
      },
    });

    if (!result) {
      throw notFound();
    }

    return {
      content: result.content,
      courseId: params.courseId,
      moduleId: params.moduleId,
      workspaceId: workspace.workspaceId,
    };
  },
});

function ModuleContentRoutePage() {
  const data = Route.useLoaderData() as ModuleContentData | undefined;
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <div className="grid gap-4">
      <FeatureSummary
        secondaryTrigger={
          <Button disabled size="xs" variant="ghost">
            <Sparkles />
            {t('common.generate_with_ai')}
          </Button>
        }
        showSecondaryTrigger
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 font-bold text-lg md:text-2xl">
              <Goal className="h-5 w-5" />
              {t('course-details-tabs.module_content')}
            </h1>
          </div>
        }
      />
      <ModuleContentEditor
        content={data.content}
        courseId={data.courseId}
        moduleId={data.moduleId}
        wsId={data.workspaceId}
      />
    </div>
  );
}
