'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConnectedMailClient } from './connected-mail-client';
import { MailAppClient } from './mail-client';
import { MeetMailWorkspaceScope } from './meet-mail-workspace-scope';
import { useMailSource } from './mail-source';
import { resolveConnectedMailFolder } from './mail-source-selection';
import { getMailFolderFromPathname } from './mail-workspace-path';

export function MailWorkspace({
  children,
  workspaceId,
  handoffWorkspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
  handoffWorkspaceId?: string;
}) {
  const { source } = useMailSource();
  const folder = getMailFolderFromPathname(usePathname());

  if (!folder) return children;

  return (
    <MeetMailWorkspaceScope workspaceId={handoffWorkspaceId ?? workspaceId}>
      <div className="-m-2 h-[calc(100dvh-var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-top,0px)))-0.75rem-var(--mobile-dock-clearance,0px))] min-h-[calc(100dvh-var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-top,0px)))-0.75rem-var(--mobile-dock-clearance,0px))] min-w-0 md:-m-4 md:h-dvh md:min-h-dvh">
        {source === 'connected' ? (
          <ConnectedMailClient
            folder={resolveConnectedMailFolder(folder)}
            key={workspaceId}
            workspaceId={workspaceId}
          />
        ) : (
          <MailAppClient folder={folder} workspaceId={workspaceId} />
        )}
      </div>
    </MeetMailWorkspaceScope>
  );
}
