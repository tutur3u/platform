'use client';

import AccountNotificationStatus from '@/components/notifications/account-notification-status';
import BrowserNotificationPermission from '@/components/notifications/browser-notification-permission';
import NotificationPreferencesTable from '@/components/notifications/notification-preferences-table';
import WorkspaceNotificationToggle from '@/components/notifications/workspace-notification-toggle';

interface WorkspaceNotificationSettingsProps {
  wsId: string;
}

export default function WorkspaceNotificationSettings({
  wsId,
}: WorkspaceNotificationSettingsProps) {
  return (
    <>
      <AccountNotificationStatus />
      <WorkspaceNotificationToggle wsId={wsId} />
      <BrowserNotificationPermission />
      <NotificationPreferencesTable scope="workspace" wsId={wsId} />
    </>
  );
}
