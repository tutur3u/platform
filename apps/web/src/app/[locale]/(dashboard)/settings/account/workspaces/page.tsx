import { WorkspaceSettingsCard } from '../components';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export default async function WorkspacesPage() {
  const user = await getCurrentUser();

  return <WorkspaceSettingsCard user={user} />;
}
