import { redirect } from 'next/navigation';
import { isHabitsEnabled } from '@/lib/habits/access';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function LegacyHabitsPage({ params }: Props) {
  const { wsId } = await params;

  if (!(await isHabitsEnabled(wsId))) {
    redirect(`/${wsId}`);
  }

  redirect(`/${wsId}/habits`);
}
