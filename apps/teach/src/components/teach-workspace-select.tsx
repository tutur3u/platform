'use client';

import type { TulearnWorkspaceSummary } from '@tuturuuu/internal-api';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';

export function TeachWorkspaceSelect({
  cacheScope,
  workspaces,
  wsId,
}: {
  cacheScope: string;
  workspaces: TulearnWorkspaceSummary[];
  wsId: string;
}) {
  return (
    <WorkspaceSelect
      cacheScope={cacheScope}
      disableCreateNewWorkspace
      fetchWorkspaces={async () =>
        workspaces.map(
          (workspace): InternalApiWorkspaceSummary => ({
            access_type: 'member',
            avatar_url: workspace.avatar_url,
            id: workspace.id,
            logo_url: workspace.logo_url,
            name: workspace.name,
            personal: false,
          })
        )
      }
      resolveNextPathname={({ nextSlug }) => `/${nextSlug}`}
      showTierBadges={false}
      standalone
      triggerClassName="h-9 max-w-44 rounded-lg border border-border bg-card px-2 font-semibold text-xs "
      wsId={wsId}
    />
  );
}
