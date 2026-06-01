import TaskProjectDetailPage from '@tuturuuu/ui/tu-do/projects/projectId/task-project-detail-page';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('task_project_detail.metadata');
  return {
    title: t('page_title'),
    description: t('page_description'),
  };
}

interface Props {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

export default async function TaskProjectPage({ params }: Props) {
  return <TaskProjectDetailPage params={params} />;
}
