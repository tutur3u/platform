'use client';

import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';

export function WorkspaceSelect({
  wsId,
  hideLeading,
  standalone,
  customRedirectSuffix,
  disableCreateNewWorkspace,
}: {
  wsId: string;
  hideLeading?: boolean;
  standalone?: boolean;
  customRedirectSuffix?: string;
  disableCreateNewWorkspace?: boolean;
}) {
  return (
    <SharedWorkspaceSelect
      wsId={wsId}
      hideLeading={hideLeading}
      standalone={standalone}
      customRedirectSuffix={customRedirectSuffix}
      disableCreateNewWorkspace={disableCreateNewWorkspace}
      fetchWorkspaces={listWorkspaces}
    />
  );
}
