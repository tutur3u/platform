import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'New',
  description: 'Manage New in the Chat area of your Tuturuuu workspace.',
};

export default async function NewChatPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/chat`);
}
