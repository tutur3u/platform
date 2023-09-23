import { notFound, redirect } from 'next/navigation';
import Chat from './chat';
import { getWorkspace } from '@/lib/workspace-helper';
import { AI_CHAT_DISABLED_PRESETS } from '@/constants/common';
import { getCurrentUser } from '@/lib/user-helper';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function AIPage({ params: { wsId } }: Props) {
  const user = await getCurrentUser();

  const workspace = await getWorkspace(wsId);
  if (!workspace?.preset) notFound();

  if (
    process.env.ANTHROPIC_API_KEY === undefined ||
    AI_CHAT_DISABLED_PRESETS.includes(workspace.preset)
  )
    redirect(`/${wsId}`);

  return <Chat user={user} />;
}
