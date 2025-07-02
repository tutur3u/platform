import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Bell } from '@tuturuuu/ui/icons';
import { Switch } from '@tuturuuu/ui/switch';
import { getTranslations } from 'next-intl/server';

interface NotificationOption {
  key: string;
  titleKey: string;
  descriptionKey: string;
}

export default async function NotificationsCard() {
  const t = await getTranslations('settings-account');

  const notificationOptions: NotificationOption[] = [
    {
      key: 'email',
      titleKey: 'email-notifications',
      descriptionKey: 'email-notifications-description',
    },
    {
      key: 'push',
      titleKey: 'push-notifications',
      descriptionKey: 'push-notifications-description',
    },
    {
      key: 'marketing',
      titleKey: 'marketing-communications',
      descriptionKey: 'marketing-communications-description',
    },
    {
      key: 'security',
      titleKey: 'security-alerts',
      descriptionKey: 'security-alerts-description',
    },
    {
      key: 'workspace',
      titleKey: 'workspace-activity',
      descriptionKey: 'workspace-activity-description',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-yellow-100 p-2 dark:bg-yellow-900/30">
            <Bell className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <CardTitle>{t('notification-preferences')}</CardTitle>
            <CardDescription>
              {t('notification-preferences-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {notificationOptions.map((option) => (
            <div
              key={option.key}
              className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="space-y-0.5">
                <p className="font-medium text-sm">
                  {t(option.titleKey as any)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t(option.descriptionKey as any)}
                </p>
              </div>
              <Switch disabled />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
