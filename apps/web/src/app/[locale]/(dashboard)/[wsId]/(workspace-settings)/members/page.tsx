import { buildSettingsDialogHref } from '@tuturuuu/ui/hooks/settings-dialog-url';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Members',
  description:
    'Manage Members in the Workspace Settings area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

/**
 * Member management lives in the settings dialog (Current workspace ->
 * Members), which enforces the same member and role permissions. This route
 * keeps bookmarks and links working by opening that tab over the workspace.
 */
export default async function WorkspaceMembersPage({ params }: Props) {
  const { wsId } = await params;
  redirect(
    buildSettingsDialogHref(
      `/${encodeURIComponent(wsId)}`,
      'workspace_members'
    )
  );
}
