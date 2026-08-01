'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { useParams } from 'next/navigation';
import type { ComponentType } from 'react';
import SharedUserNavClient from './user-nav-client';

interface CreateUserNavClientConfig {
  appName: string;
  ttrUrl: string;
  externalSettingsHost?: boolean;
  SettingsDialog?: ComponentType<{
    wsId?: string;
    user: WorkspaceUser | null;
  }>;
}

export interface UserNavClientProps {
  user: WorkspaceUser | null;
  locale: string | undefined;
  hideMetadata?: boolean;
}

export function createUserNavClient({
  appName,
  ttrUrl,
  externalSettingsHost,
  SettingsDialog,
}: CreateUserNavClientConfig) {
  return function CustomUserNavClient({
    user,
    locale,
    hideMetadata = false,
  }: UserNavClientProps) {
    const params = useParams();
    const wsId = params?.wsId as string | undefined;

    return (
      <SharedUserNavClient
        user={user}
        locale={locale}
        hideMetadata={hideMetadata}
        appName={appName}
        ttrUrl={ttrUrl}
        externalSettingsHost={externalSettingsHost}
        settingsDialog={
          user && SettingsDialog ? (
            <SettingsDialog wsId={wsId} user={user} />
          ) : undefined
        }
      />
    );
  };
}
