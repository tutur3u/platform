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

  const secrets = await getSecrets(wsId, ['ENABLE_CHAT', 'ENABLE_DASHBOARD']);

  const verifySecret = (secret: string, value: string) =>
    secrets.find((s) => s.name === secret)?.value === value;

  const enableChat = verifySecret('ENABLE_CHAT', 'true');
  const enableDashboard = verifySecret('ENABLE_DASHBOARD', 'true');

  if (!enableChat) redirect(enableDashboard ? `/${wsId}` : `/${wsId}/settings`);

  return <Chat id="123" />;
}
