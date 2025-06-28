import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import WorkspaceSettingsCard from './workspace-settings-card';

export default async function WorkspacesPage() {
  const user = await getCurrentUser();

  return <WorkspaceSettingsCard user={user} />;
}
