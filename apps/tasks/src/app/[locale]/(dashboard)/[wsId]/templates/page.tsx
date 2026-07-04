import TaskTemplatesPage from '@tuturuuu/ui/tu-do/templates/task-templates-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TemplatesPage({ params }: Props) {
  await connection();

  return (
    <TaskTemplatesPage
      params={params}
      config={{ templatesBasePath: 'templates' }}
    />
  );
}
