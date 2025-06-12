import ResetPasswordDialog from './reset-password-dialog';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Shield } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';

interface SecuritySettingsCardProps {
  user: WorkspaceUser | null;
}

export default async function SecuritySettingsCard({
  user,
}: SecuritySettingsCardProps) {
  const t = await getTranslations('settings-account');

  if (!user) return null;

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-orange-100 p-2 dark:bg-orange-900/30">
            <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <CardTitle className="text-xl">{t('security-settings')}</CardTitle>
            <CardDescription>
              {t('security-settings-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <SettingItemTab
          title={t('change-password')}
          description={t('change-password-description')}
        >
          <ResetPasswordDialog user={user} />
        </SettingItemTab>
      </CardContent>
    </Card>
  );
}
