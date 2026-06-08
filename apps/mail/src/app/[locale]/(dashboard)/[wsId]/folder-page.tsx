import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { MailAppClient } from './mail-client';
import {
  DEFAULT_MAIL_FOLDER,
  getMailFolderHref,
  type MailFolder,
} from './mail-folders';

interface MailFolderPageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export async function redirectToMailInbox({ params }: MailFolderPageProps) {
  const workspaceSlug = await resolveMailWorkspaceSlug(params);
  redirect(getMailFolderHref(workspaceSlug, DEFAULT_MAIL_FOLDER));
}

export async function renderMailFolderPage(
  { params }: MailFolderPageProps,
  folder: MailFolder
) {
  const workspaceSlug = await resolveMailWorkspaceSlug(params);

  return (
    <div className="-m-2 h-[calc(100dvh-4.25rem)] md:-m-4 md:h-dvh">
      <MailAppClient folder={folder} workspaceId={workspaceSlug} />
    </div>
  );
}

async function resolveMailWorkspaceSlug(params: MailFolderPageProps['params']) {
  const { wsId: id } = await params;
  const user = await getSatelliteAppSessionUser('mail');

  if (!user?.id) redirect('/login');
  if (!isExactTuturuuuDotComEmail(user.email)) redirect('/not-available');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace?.joined) notFound();

  return toWorkspaceSlug(workspace.id, {
    personal: !!workspace.personal,
  });
}
