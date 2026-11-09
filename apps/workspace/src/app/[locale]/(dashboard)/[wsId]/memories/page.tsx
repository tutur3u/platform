import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { MemoriesClient } from './memories-client';

export const metadata: Metadata = {
  title: 'Memories',
  description: 'Explore AI memories in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function MemoriesPage({ params }: Props) {
  await connection();

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();
        if (permissions.withoutPermission('ai_lab')) redirect(`/${wsId}`);

        const t = await getTranslations();

        return (
          <>
            <FeatureSummary
              pluralTitle={t('ws-memories.plural')}
              singularTitle={t('ws-memories.singular')}
              description={t('ws-memories.description')}
            />
            <Separator className="my-4" />
            <MemoriesClient wsId={wsId} />
          </>
        );
      }}
    </WorkspaceWrapper>
  );
}
