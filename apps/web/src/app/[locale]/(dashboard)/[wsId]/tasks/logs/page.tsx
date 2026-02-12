import TaskLogsPage from '@tuturuuu/ui/tu-do/logs/task-logs-page';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tasks-logs');
  return {
    title: t('title', { defaultValue: 'Activity Logs' }),
    description: t('description', {
      defaultValue: 'View task change history across your workspace',
    }),
  };
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskLogsPage params={params} />;
}
