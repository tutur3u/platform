'use client';

import BrowserNotificationPermission from '@/components/notifications/browser-notification-permission';
import NotificationPreferencesTable from '@/components/notifications/notification-preferences-table';

export default function NotificationsCard() {
  return (
    <div className="space-y-8">
      {/* Browser Permission */}
      <BrowserNotificationPermission />

      {/* Notification Preferences Table */}
      <NotificationPreferencesTable scope="account" />
    </div>
  );
}
