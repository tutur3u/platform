import { redirect } from 'next/navigation';

export default async function NewChatPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/${wsId}/chat`);
}
