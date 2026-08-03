'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { TTR_URL } from '@/constants/common';
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
      platformWorkspaceSetupUrl={TTR_URL}
      wsId={wsId}
    />
  );
}
