import HabitsPage from '@tuturuuu/ui/tu-do/habits/habits-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Habits',
  description: 'Manage your recurring habits and track your streaks.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <HabitsPage params={params} />;
}
