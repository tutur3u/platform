'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  customRedirectSuffix,
  disableCreateNewWorkspace,
  hideLeading,
  wsId,
}: {
  customRedirectSuffix?: string;
  disableCreateNewWorkspace?: boolean;
  hideLeading?: boolean;
  wsId: string;
}) {
  return (
    <SharedWorkspaceSelect
      customRedirectSuffix={customRedirectSuffix}
      disableCreateNewWorkspace={disableCreateNewWorkspace}
      fallbackLogoUrl="/media/logos/transparent.png"
      fetchWorkspaces={fetchWorkspaces}
      hideLeading={hideLeading}
      wsId={wsId}
    />
  );
}
