'use client';

import { Button } from '@tuturuuu/ui/button';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import type { ReactNode } from 'react';
import { ConnectedMailClient } from './connected-mail-client';
import { MailAppClient } from './mail-client';
import { getMailFolderFromPathname } from './mail-workspace-path';

export function MailWorkspace({
  children,
  workspaceId,
  connectedByDefault = false,
}: {
  children: ReactNode;
  workspaceId: string;
  connectedByDefault?: boolean;
}) {
  const t = useTranslations('mail');
  const [connected, setConnected] = useQueryState(
    'connected',
    parseAsString.withDefault(connectedByDefault ? '1' : '')
  );
  const folder = getMailFolderFromPathname(usePathname());

  if (!folder) return children;

  return (
    <div className="-m-2 h-[calc(100dvh-4.25rem)] min-h-[calc(100dvh-4.25rem)] min-w-0 md:-m-4 md:h-dvh md:min-h-dvh">
      <div className="flex h-full flex-col">
        <div className="flex gap-2 border-b bg-background p-2">
          <Button
            variant={connected ? 'ghost' : 'secondary'}
            onClick={() => void setConnected('')}
          >
            {t('connected_managed')}
          </Button>
          <Button
            variant={connected ? 'secondary' : 'ghost'}
            onClick={() => void setConnected('1')}
          >
            {t('connected_accounts')}
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          {connected ? (
            <ConnectedMailClient key={workspaceId} workspaceId={workspaceId} />
          ) : (
            <MailAppClient folder={folder} workspaceId={workspaceId} />
          )}
        </div>
      </div>
    </div>
  );
}
