import TaskLabelsPage from '@tuturuuu/ui/tu-do/labels/task-labels-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Labels',
  description: 'Manage Labels in the Tasks area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskLabelsPage params={params} />;
}
