import TaskDraftsPage from '@tuturuuu/ui/tu-do/drafts/task-drafts-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskDraftsPage params={params} />;
}
