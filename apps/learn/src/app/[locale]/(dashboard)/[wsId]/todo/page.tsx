import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { connection } from 'next/server';
import { TodoClient } from '@/components/education-todo';
import { redirect } from '@/i18n/navigation';

export default async function TodoPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  await connection();
  const { locale, wsId } = await params;
  const actor = await getSatelliteAppSessionUser('learn');
  if (!actor) return redirect({ href: `/login?next=/${wsId}/todo`, locale });
  return (
    <TodoClient actorId={actor.id} key={`${actor.id}:${wsId}`} wsId={wsId} />
  );
}
