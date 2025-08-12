import PendingInvitations from '../components/pending-invitations';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function EventInvitationsPage({ params }: PageProps) {
  const { wsId, locale } = await params;
  const workspace = await getWorkspace(wsId);

  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);
  if (!workspace?.id) return null;

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold">Event Invitations</h1>
        <p className="text-muted-foreground">
          Manage your event invitations and respond to scheduled events from
          your workspace.
        </p>
      </div>

      <PendingInvitations wsId={wsId} />
    </div>
  );
}
