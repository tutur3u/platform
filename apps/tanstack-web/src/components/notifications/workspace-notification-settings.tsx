'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import type {
  AccountNotificationPreference,
  WorkspaceNotificationPreference,
  WorkspaceNotificationPreferenceUpdate,
} from '@tuturuuu/internal-api';
import { AccountNotificationStatus } from './account-notification-status';
import { BrowserNotificationPermission } from './browser-notification-permission';
import { NotificationPreferencesTable } from './notification-preferences-table';
import {
  accountNotificationPreferencesQueryKey,
  workspaceNotificationPreferencesQueryKey,
} from './query-keys';
import { WorkspaceNotificationToggle } from './workspace-notification-toggle';

type WorkspaceNotificationSettingsProps = {
  accountPreferences: AccountNotificationPreference[];
  loadAccountPreferences: () => Promise<AccountNotificationPreference[]>;
  loadWorkspacePreferences: () => Promise<WorkspaceNotificationPreference[]>;
  updateWorkspacePreferences: (
    preferences: WorkspaceNotificationPreferenceUpdate[]
  ) => Promise<void>;
  workspaceId: string;
  workspacePreferences: WorkspaceNotificationPreference[];
};

function accountPreferencesQuery(
  loadAccountPreferences: () => Promise<AccountNotificationPreference[]>
) {
  return queryOptions({
    queryFn: loadAccountPreferences,
    queryKey: accountNotificationPreferencesQueryKey,
    retry: false,
  });
}

function workspacePreferencesQuery(
  workspaceId: string,
  loadWorkspacePreferences: () => Promise<WorkspaceNotificationPreference[]>
) {
  return queryOptions({
    queryFn: loadWorkspacePreferences,
    queryKey: workspaceNotificationPreferencesQueryKey(workspaceId),
    retry: false,
  });
}

export function WorkspaceNotificationSettings({
  accountPreferences,
  loadAccountPreferences,
  loadWorkspacePreferences,
  updateWorkspacePreferences,
  workspaceId,
  workspacePreferences,
}: WorkspaceNotificationSettingsProps) {
  const accountQuery = useQuery({
    ...accountPreferencesQuery(loadAccountPreferences),
    initialData: accountPreferences,
  });
  const workspaceQuery = useQuery({
    ...workspacePreferencesQuery(workspaceId, loadWorkspacePreferences),
    initialData: workspacePreferences,
  });

  return (
    <>
      <AccountNotificationStatus preferences={accountQuery.data} />
      <WorkspaceNotificationToggle
        preferences={workspaceQuery.data}
        updateWorkspacePreferences={updateWorkspacePreferences}
        workspaceId={workspaceId}
      />
      <BrowserNotificationPermission />
      <NotificationPreferencesTable
        preferences={workspaceQuery.data}
        scope="workspace"
        updatePreferences={updateWorkspacePreferences}
        workspaceId={workspaceId}
      />
    </>
  );
}
