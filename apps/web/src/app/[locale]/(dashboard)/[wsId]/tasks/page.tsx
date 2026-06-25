import type { Metadata } from 'next';
import { TaskBoardEntryPage } from './task-board-entry';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'Open your default task board.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default function Page({ params }: Props) {
  return <TaskBoardEntryPage params={params} />;
}
