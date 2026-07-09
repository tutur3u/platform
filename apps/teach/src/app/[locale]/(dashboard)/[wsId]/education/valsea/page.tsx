import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { ValseaClassroomClient } from './page-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workspace-education-tabs.valsea');

  return {
    description: t('page_description'),
    title: t('title'),
  };
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function ValseaClassroomPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId: routeWsId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);

  return (
    <div className="flex min-h-full w-full flex-col gap-5 p-4">
      <EducationPageHeader
        description={t('workspace-education-tabs.valsea.page_description')}
        title={t('workspace-education-tabs.valsea.title')}
      />

      <ValseaClassroomClient wsId={resolvedWsId} />
    </div>
  );
}
