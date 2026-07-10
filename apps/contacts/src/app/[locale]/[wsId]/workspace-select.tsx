'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  wsId,
  hideLeading,
  customRedirectSuffix,
  disableCreateNewWorkspace,
}: {
  wsId: string;
  hideLeading?: boolean;
  customRedirectSuffix?: string;
  disableCreateNewWorkspace?: boolean;
}) {
  return (
    <SharedWorkspaceSelect
      wsId={wsId}
      hideLeading={hideLeading}
      customRedirectSuffix={customRedirectSuffix}
      disableCreateNewWorkspace={disableCreateNewWorkspace}
      fetchWorkspaces={fetchWorkspaces}
    />
  );
}
