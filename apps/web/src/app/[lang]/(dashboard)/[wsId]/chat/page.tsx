import { notFound, redirect } from 'next/navigation';
import Chat from './chat';
import { getSecrets, getWorkspace } from '@/lib/workspace-helper';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function AIPage({ params: { wsId } }: Props) {
  const workspace = await getWorkspace(wsId);
  if (!workspace?.preset) notFound();

  const secrets = await getSecrets(wsId, ['ENABLE_CHAT']);

  const verifySecret = (secret: string, value: string) =>
    secrets.find((s) => s.name === secret)?.value === value;

  const enableChat = verifySecret('ENABLE_CHAT', 'true');
  if (!enableChat) redirect(`/${wsId}`);

  return <Chat id="123" />;
}
