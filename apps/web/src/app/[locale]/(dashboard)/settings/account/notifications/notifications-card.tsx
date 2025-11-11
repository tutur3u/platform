'use client';

import NotificationPreferencesTable from '@/components/notifications/notification-preferences-table';
import BrowserNotificationPermission from '@/components/notifications/browser-notification-permission';

export default function NotificationsCard() {
  return (
    <div className="space-y-6">
      {/* Browser Permission */}
      <BrowserNotificationPermission />

      {/* Notification Preferences Table */}
      <NotificationPreferencesTable scope="account" />
    </div>
  );
}
