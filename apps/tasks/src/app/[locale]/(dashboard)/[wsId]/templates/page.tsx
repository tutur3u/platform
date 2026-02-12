import TaskTemplatesPage from '@tuturuuu/ui/tu-do/templates/task-templates-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TemplatesPage({ params }: Props) {
  return (
    <TaskTemplatesPage
      params={params}
      config={{ templatesBasePath: 'templates' }}
    />
  );
}
