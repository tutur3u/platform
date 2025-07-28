import { redirect } from 'next/navigation';

export default async function TumeetPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/tumeet/plans`);
}
