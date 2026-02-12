import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Tuturuuu Meet',
  description: 'Manage Tuturuuu Meet in your Tuturuuu workspace.',
};

export default async function TumeetPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/tumeet/plans`);
}
