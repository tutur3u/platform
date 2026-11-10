import WorkspaceNotificationSettings from '@/components/notifications/workspace-notification-settings';
import WorkspaceWrapper from '@/components/workspace-wrapper';

interface NotificationSettingsPageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function NotificationSettingsPage({
  params,
}: NotificationSettingsPageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {({ wsId }) => (
        <div className="container max-w-4xl space-y-6 py-8">
          <div>
            <h1 className="font-bold text-3xl tracking-tight">
              Notification Settings
            </h1>
            <p className="text-foreground/60 text-sm">
              Configure how you receive notifications for different events in
              this workspace
            </p>
          </div>

          <WorkspaceNotificationSettings wsId={wsId} />
        </div>
      )}
    </WorkspaceWrapper>
  );
}
