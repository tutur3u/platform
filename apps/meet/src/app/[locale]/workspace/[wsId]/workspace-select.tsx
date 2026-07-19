'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
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
      standalone={standalone}
      resolveNextPathname={resolveWorkspacePath}
      wsId={wsId}
    />
  );
}
