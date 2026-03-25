import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function LegacyHabitsPage({ params }: Props) {
  const { wsId } = await params;

  redirect(`/${wsId}/habits`);
}
