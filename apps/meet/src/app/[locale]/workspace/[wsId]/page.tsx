import { redirect } from 'next/navigation';

export default async function MeetWorkspacePage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;

  redirect(`/workspace/${wsId}/plans`);
}
