import { createFileRoute, notFound } from '@tanstack/react-router';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import { useTranslations } from 'next-intl';
import { ValseaClassroomClient } from '../../../../components/education/valsea/page-client';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import { resolveFullWorkspace } from '../../../../lib/platform/workspace';

type ValseaLoaderData = {
  workspaceId: string;
};

export const Route = createFileRoute('/$locale/$wsId/education/valsea')({
  component: ValseaClassroomRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Convert mixed-language classroom speech into clearer notes, translations, semantic cues, learner tone, and teacher next steps.',
      locale,
      title: 'Valsea Classroom Studio',
    });
  },
  loader: async ({ params }): Promise<ValseaLoaderData> => {
    // Auth gate FIRST, fail closed.
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education/valsea`,
    });

    // Legacy resolveRouteWorkspace() -> getWorkspace() -> notFound() when
    // missing/forbidden. No personal/permission gate in legacy.
    const workspace = await resolveFullWorkspace({
      data: { wsId: params.wsId },
    });
    if (!workspace.exists) {
      throw notFound();
    }

    return {
      workspaceId: workspace.workspace.id,
    };
  },
});

function ValseaClassroomRoutePage() {
  const data = Route.useLoaderData() as ValseaLoaderData | undefined;
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <div className="flex min-h-full w-full flex-col gap-5 p-4">
      <EducationPageHeader
        description={t('workspace-education-tabs.valsea.page_description')}
        title={t('workspace-education-tabs.valsea.title')}
      />

      <ValseaClassroomClient wsId={data.workspaceId} />
    </div>
  );
}
