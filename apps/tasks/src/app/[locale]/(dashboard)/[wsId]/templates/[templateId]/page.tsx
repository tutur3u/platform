import TaskTemplateDetailPage from '@tuturuuu/ui/tu-do/templates/templateId/task-template-detail-page';

interface Props {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

export default async function TemplateDetailPage({ params }: Props) {
  return <TaskTemplateDetailPage params={params} />;
}
