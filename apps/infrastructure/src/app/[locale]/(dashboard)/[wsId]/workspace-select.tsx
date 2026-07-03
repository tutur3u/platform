'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  hideLeading,
  wsId,
}: {
  hideLeading?: boolean;
  wsId: string;
}) {
  return (
    <SharedWorkspaceSelect
      disableCreateNewWorkspace
      fetchWorkspaces={fetchWorkspaces}
      hideLeading={hideLeading}
      resolveNextPathname={() => '/internal'}
      wsId={wsId}
    />
  );
}
