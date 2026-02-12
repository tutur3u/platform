import MyTasksPage from '@tuturuuu/ui/tu-do/my-tasks/my-tasks-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Tasks',
  description: 'View and manage your assigned tasks.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <MyTasksPage params={params} />;
}
