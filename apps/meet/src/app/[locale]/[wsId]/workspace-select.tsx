'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { TTR_URL } from '@/constants/common';
import { resolveMeetWorkspacePath } from '@/lib/workspace-navigation';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  disableCreateNewWorkspace,
  hideLeading,
  standalone,
  wsId,
}: {
  disableCreateNewWorkspace?: boolean;
  hideLeading?: boolean;
  standalone?: boolean;
  wsId: string;
}) {
  return (
    <SharedWorkspaceSelect
      disableCreateNewWorkspace={disableCreateNewWorkspace}
      fetchWorkspaces={fetchWorkspaces}
      hideLeading={hideLeading}
      platformWorkspaceSetupUrl={TTR_URL}
      standalone={standalone}
      resolveNextPathname={resolveMeetWorkspacePath}
      wsId={wsId}
    />
  );
}
