import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { Youtube } from '@tuturuuu/icons';
import {
  listWorkspaceCourseModules,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import DeleteLinkButton from '@tuturuuu/ui/custom/education/modules/youtube/delete-link-button';
import { YoutubeEmbed } from '@tuturuuu/ui/custom/education/modules/youtube/embed';
import YouTubeLinkForm from '@tuturuuu/ui/custom/education/modules/youtube/form';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { extractYoutubeId } from '@/lib/platform/youtube';

type ModuleYoutubeLinksData = {
  courseId: string;
  links: string[];
  moduleId: string;
  workspaceId: string;
};

const loadModuleYoutubeLinks = createServerFn({ method: 'GET' })
  .validator(
    (data: { courseId: string; moduleId: string; wsId: string }) => data
  )
  .handler(async ({ data }): Promise<{ links: string[] } | null> => {
    const modules = await listWorkspaceCourseModules(
      data.wsId,
      data.courseId,
      withForwardedInternalApiAuth(getRequestHeaders())
    );

    const module = modules.find((item) => item.id === data.moduleId);
    if (!module) {
      return null;
    }

    return {
      links: Array.isArray(module.youtube_links) ? module.youtube_links : [],
    };
  });

export const Route = createFileRoute(
  '/$locale/$wsId/education/courses/$courseId/modules/$moduleId/youtube-links'
)({
  component: ModuleYoutubeLinksRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Manage Youtube Links in the Module area of your Tuturuuu workspace.',
      locale,
      title: 'Youtube Links',
    });
  },
  loader: async ({ params }): Promise<ModuleYoutubeLinksData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/courses/${params.courseId}/modules/${params.moduleId}/youtube-links`,
    });

    // Legacy resolveRouteWorkspace -> notFound when the workspace is missing.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    const result = await loadModuleYoutubeLinks({
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
      courseId: params.courseId,
      links: result.links,
      moduleId: params.moduleId,
      workspaceId: workspace.workspaceId,
    };
  },
});

function ModuleYoutubeLinksRoutePage() {
  const data = Route.useLoaderData() as ModuleYoutubeLinksData | undefined;
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <div className="grid gap-4">
      <FeatureSummary
        createDescription={t('ws-course-modules.add_youtube_link_description')}
        createTitle={t('ws-course-modules.add_link')}
        form={
          <YouTubeLinkForm
            links={data.links}
            moduleId={data.moduleId}
            wsId={data.workspaceId}
          />
        }
        pluralTitle={t('ws-course-modules.youtube_links')}
        singularTitle={t('ws-course-modules.youtube_link')}
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 font-bold text-lg md:text-2xl">
              <Youtube className="h-5 w-5" />
              {t('course-details-tabs.youtube_links')}
            </h1>
          </div>
        }
      />
      {data.links.map((link, index) => (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 p-2 md:p-4"
          key={`${index}-${link}`}
        >
          <DeleteLinkButton
            link={link}
            links={data.links}
            moduleId={data.moduleId}
            wsId={data.workspaceId}
          />
          <a
            className="font-semibold hover:underline"
            href={link}
            rel="noopener noreferrer"
            target="_blank"
          >
            {link}
          </a>
          <Separator className="my-2" />
          <YoutubeEmbed embedId={extractYoutubeId(link)} />
        </div>
      ))}
    </div>
  );
}
