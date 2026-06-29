import TaskTemplatesPage from '@tuturuuu/ui/tu-do/templates/task-templates-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Task Templates',
  description: 'Browse and manage task and board templates in your workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TemplatesPage({ params }: Props) {
  return (
    <TaskTemplatesPage
      params={params}
      config={{ templatesBasePath: 'tasks/templates' }}
    />
  );
}
