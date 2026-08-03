'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { TTR_URL } from '@/constants/common';
import { fetchWorkspaces } from './actions';

function resolveWorkspacePath({
  currentPathname,
  nextSlug,
}: {
  currentPathname: string;
  nextSlug: string;
}) {
  return currentPathname.replace(
    /^((?:\/[a-z]{2})?\/workspace)\/[^/]+/,
    `$1/${nextSlug}`
  );
}

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
      resolveNextPathname={resolveWorkspacePath}
      wsId={wsId}
    />
  );
}
