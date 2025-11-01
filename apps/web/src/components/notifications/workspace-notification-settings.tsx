'use client';

import NotificationPreferencesTable from '@/components/notifications/notification-preferences-table';
import BrowserNotificationPermission from '@/components/notifications/browser-notification-permission';
import AdvancedNotificationSettings from '@/components/notifications/advanced-notification-settings';
import AccountNotificationStatus from '@/components/notifications/account-notification-status';
import WorkspaceNotificationToggle from '@/components/notifications/workspace-notification-toggle';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotificationPreferences';
import type { DigestFrequency } from '@/hooks/useAccountNotificationPreferences';

interface WorkspaceNotificationSettingsProps {
  wsId: string;
}

export default function WorkspaceNotificationSettings({
  wsId,
}: WorkspaceNotificationSettingsProps) {
  const { data: preferences } = useNotificationPreferences({ wsId });
  const updatePreferences = useUpdateNotificationPreferences();

  // Extract advanced settings from preferences (workspace-scoped)
  const digestFrequency =
    (preferences?.[0]?.digest_frequency as DigestFrequency) || 'immediate';
  const quietHoursStart = preferences?.[0]?.quiet_hours_start || null;
  const quietHoursEnd = preferences?.[0]?.quiet_hours_end || null;
  const timezone = preferences?.[0]?.timezone || 'UTC';

  const handleAdvancedUpdate = async (settings: {
    digestFrequency?: DigestFrequency;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    timezone?: string;
  }) => {
    // Update preferences with new advanced settings
    // We need to update all existing preferences with the new settings
    await updatePreferences.mutateAsync({
      wsId,
      preferences: [], // Empty array since we're only updating advanced settings
      ...settings,
    });
  };

  return (
    <>
      {/* Account Notification Status */}
      <AccountNotificationStatus />

      {/* Workspace Notification Toggle */}
      <WorkspaceNotificationToggle wsId={wsId} />

      {/* Browser Permission */}
      <BrowserNotificationPermission />

      {/* Notification Preferences Table */}
      <NotificationPreferencesTable scope="workspace" wsId={wsId} />

      {/* Advanced Settings */}
      <AdvancedNotificationSettings
        digestFrequency={digestFrequency}
        quietHoursStart={quietHoursStart}
        quietHoursEnd={quietHoursEnd}
        timezone={timezone}
        onUpdate={handleAdvancedUpdate}
      />
    </>
  );
}
