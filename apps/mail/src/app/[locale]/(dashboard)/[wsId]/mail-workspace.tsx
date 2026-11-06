'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConnectedMailClient } from './connected-mail-client';
import { MailAppClient } from './mail-client';
import { useMailSource } from './mail-source';
import { getMailFolderFromPathname } from './mail-workspace-path';

export function MailWorkspace({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const { source } = useMailSource();
  const folder = getMailFolderFromPathname(usePathname());

  if (!folder) return children;

  return (
    <div className="-m-2 h-[calc(100dvh-4.25rem)] min-h-[calc(100dvh-4.25rem)] min-w-0 md:-m-4 md:h-dvh md:min-h-dvh">
      {source === 'connected' ? (
        <ConnectedMailClient key={workspaceId} workspaceId={workspaceId} />
      ) : (
        <MailAppClient folder={folder} workspaceId={workspaceId} />
      )}
    </div>
  );
}
