import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { MailAppClient } from './mail-client';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function MailPage({ params }: PageProps) {
  const { wsId: id } = await params;
  const user = getAppSessionUserFromRequest(
    { headers: await headers() },
    { targetApp: 'mail' }
  );

  if (!user?.id) redirect('/login');
  if (!isExactTuturuuuDotComEmail(user.email)) redirect('/not-available');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace?.joined) notFound();

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  return <MailAppClient workspaceId={workspaceSlug} />;
}
