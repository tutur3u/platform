import TaskProjectsPage from '@tuturuuu/ui/tu-do/projects/task-projects-page';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('task-projects');
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
  return <TaskProjectsPage params={params} />;
}
