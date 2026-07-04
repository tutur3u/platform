import HabitsPage from '@tuturuuu/ui/tu-do/habits/habits-page';
import { connection } from 'next/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  return <HabitsPage params={params} />;
}
