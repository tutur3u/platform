'use client';

import { WorkspaceSelect as SharedWorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { fetchWorkspaces } from './actions';

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
      disableCreateNewWorkspace={disableCreateNewWorkspace ?? true}
      fetchWorkspaces={fetchWorkspaces}
      resolveNextPathname={({ currentPathname, nextSlug }) => {
        const nextBasePath = `/${nextSlug}`;

        if (nextSlug === 'internal') {
          return `${nextBasePath}/projects`;
        }

        if (currentPathname.endsWith('/projects')) {
          return nextBasePath;
        }

        return currentPathname.replace(/^\/[^/]+/, nextBasePath);
      }}
    />
  );
}
