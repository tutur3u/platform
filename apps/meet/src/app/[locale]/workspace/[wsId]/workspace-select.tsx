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
  wsId,
}: {
  disableCreateNewWorkspace?: boolean;
  hideLeading?: boolean;
  wsId: string;
}) {
  return (
    <SharedWorkspaceSelect
      disableCreateNewWorkspace={disableCreateNewWorkspace}
      fetchWorkspaces={fetchWorkspaces}
      hideLeading={hideLeading}
      resolveNextPathname={resolveWorkspacePath}
      wsId={wsId}
    />
  );
}
