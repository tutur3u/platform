import TaskTemplateDetailPage from '@tuturuuu/ui/tu-do/templates/templateId/task-template-detail-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

export default async function TemplateDetailPage({ params }: Props) {
  await connection();

  return (
    <TaskTemplateDetailPage
      params={params}
      config={{ templatesBasePath: 'templates' }}
    />
  );
}
