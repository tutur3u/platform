import TaskEstimatesPage from '@tuturuuu/ui/tu-do/estimates/task-estimates-page';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('task-estimates');
  return {
    title: t('page_title'),
    description: t('page_description'),
  };
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskEstimatesPage params={params} />;
}
