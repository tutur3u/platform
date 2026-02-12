import TaskDraftsPage from '@tuturuuu/ui/tu-do/drafts/task-drafts-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Task Drafts',
  description: 'Manage your task drafts before publishing them to boards.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return (
    <TaskDraftsPage
      params={params}
      config={{
        showFeatureSummary: true,
        showSeparator: true,
      }}
    />
  );
}
