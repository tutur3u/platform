import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import WorkspaceSettingsCard from './workspace-settings-card';

export const metadata: Metadata = {
  title: 'Workspaces',
  description:
    'Manage Workspaces in the Account area of your Tuturuuu workspace.',
};

export default async function WorkspacesPage() {
  const user = await getCurrentUser();

  return <WorkspaceSettingsCard user={user} />;
}
