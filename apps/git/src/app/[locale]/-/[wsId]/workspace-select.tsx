'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  hideLeading,
  standalone,
  wsId,
}: {
  hideLeading?: boolean;
  standalone?: boolean;
  wsId: string;
}) {
  return (
    <SharedWorkspaceSelect
      disableCreateNewWorkspace
      fetchWorkspaces={fetchWorkspaces}
      hideLeading={hideLeading}
      standalone={standalone}
      wsId={wsId}
    />
  );
}
