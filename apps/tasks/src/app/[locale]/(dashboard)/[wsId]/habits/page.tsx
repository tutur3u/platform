import HabitsPage from '@tuturuuu/ui/tu-do/habits/habits-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <HabitsPage params={params} />;
}
