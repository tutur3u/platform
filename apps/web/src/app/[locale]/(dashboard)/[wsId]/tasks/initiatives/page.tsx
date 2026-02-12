import TaskInitiativesPage from '@tuturuuu/ui/tu-do/initiatives/task-initiatives-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Task Initiatives',
  description: 'Group projects into strategic initiatives for your workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskInitiativesPage params={params} />;
}
