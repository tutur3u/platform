import TaskTemplateDetailPage from '@tuturuuu/ui/tu-do/templates/templateId/task-template-detail-page';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { templateId } = await params;

  return {
    title: `Template ${templateId} - Board Template`,
    description: 'View and use this board template in your workspace.',
  };
}

export default async function TemplateDetailPage({ params }: Props) {
  return <TaskTemplateDetailPage params={params} />;
}
