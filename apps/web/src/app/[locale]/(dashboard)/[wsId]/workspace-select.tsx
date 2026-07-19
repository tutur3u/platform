'use client';

import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './workspace-list-actions';

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
      fallbackLogoUrl={TUTURUUU_LOCAL_LOGO_URL}
      fetchWorkspaces={fetchWorkspaces}
    />
  );
}
