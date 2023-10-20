import { notFound, redirect } from 'next/navigation';
import Chat from './chat';
import { getWorkspace } from '@/lib/workspace-helper';
import { AI_CHAT_DISABLED_PRESETS } from '@/constants/common';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function AIPage({ params: { wsId } }: Props) {
  const workspace = await getWorkspace(wsId);
  if (!workspace?.preset) notFound();

  if (AI_CHAT_DISABLED_PRESETS.includes(workspace.preset)) redirect(`/${wsId}`);

  return <Chat id="123" />;
}
