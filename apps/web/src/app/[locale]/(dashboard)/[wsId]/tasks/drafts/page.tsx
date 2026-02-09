import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { DraftsPage } from '@tuturuuu/ui/tu-do/drafts/drafts-page';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Task Drafts',
  description: 'Manage your task drafts before publishing them to boards.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskDraftsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const { withoutPermission } = await getPermissions({ wsId });
        if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

        return (
          <div className="space-y-6">
            <FeatureSummary
              pluralTitle={t('task-drafts.title')}
              singularTitle={t('task-drafts.title')}
              description={t('task-drafts.empty_description')}
            />
            <Separator />
            <DraftsPage wsId={wsId} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
