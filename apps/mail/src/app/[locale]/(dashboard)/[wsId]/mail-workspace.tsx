'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MailAppClient } from './mail-client';
import { getMailFolderFromPathname } from './mail-workspace-path';

export function MailWorkspace({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const folder = getMailFolderFromPathname(usePathname());

  if (!folder) return children;

  return (
    <div className="-m-2 h-[calc(100dvh-4.25rem)] md:-m-4 md:h-dvh">
      <MailAppClient folder={folder} workspaceId={workspaceId} />
    </div>
  );
}
