'use client';

import NotificationsCard from './notifications-card';

export default function NotificationSettings() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-medium text-lg">General Notifications</h3>
        <p className="text-muted-foreground text-sm">
          Manage your notification preferences across the platform
        </p>
        <div className="mt-4">
          <NotificationsCard />
        </div>
      </div>
    </div>
  );
}
