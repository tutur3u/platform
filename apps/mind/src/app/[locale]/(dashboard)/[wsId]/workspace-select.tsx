'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  wsId,
  hideLeading,
}: {
  wsId: string;
  hideLeading?: boolean;
}) {
  return (
    <SharedWorkspaceSelect
      disableCreateNewWorkspace
      fetchWorkspaces={fetchWorkspaces}
      hideLeading={hideLeading}
      resolveNextPathname={({ nextSlug }) => `/${nextSlug}`}
      wsId={wsId}
    />
  );
}
