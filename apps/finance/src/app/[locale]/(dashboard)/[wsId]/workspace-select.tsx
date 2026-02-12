'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  t,
  wsId,
  hideLeading,
  customRedirectSuffix,
  disableCreateNewWorkspace,
}: {
  t: any;
  wsId: string;
  hideLeading?: boolean;
  customRedirectSuffix?: string;
  disableCreateNewWorkspace?: boolean;
}) {
  return (
    <SharedWorkspaceSelect
      t={t}
      wsId={wsId}
      hideLeading={hideLeading}
      customRedirectSuffix={customRedirectSuffix}
      disableCreateNewWorkspace={disableCreateNewWorkspace}
      fetchWorkspaces={fetchWorkspaces}
    />
  );
}
