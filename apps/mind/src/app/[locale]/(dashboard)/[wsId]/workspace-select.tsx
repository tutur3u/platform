'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

export function WorkspaceSelect({
  wsId,
  hideLeading,
  standalone,
}: {
  wsId: string;
  hideLeading?: boolean;
  standalone?: boolean;
}) {
  return (
    <SharedWorkspaceSelect
      disableCreateNewWorkspace
      fetchWorkspaces={fetchWorkspaces}
      hideLeading={hideLeading}
      standalone={standalone}
      resolveNextPathname={({ nextSlug }) => `/${nextSlug}`}
      wsId={wsId}
    />
  );
}
