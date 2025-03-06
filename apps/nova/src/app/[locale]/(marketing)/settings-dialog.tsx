import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import SettingItemTab from '@/components/settings/SettingItemTab';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { DialogContent, DialogHeader, DialogTitle } from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

interface UserSettingsDialogProps {
  user: WorkspaceUser;
}

export default function UserSettingsDialog({ user }: UserSettingsDialogProps) {
  const t = useTranslations();

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('settings-account.account')}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1 md:max-w-lg md:min-w-max">
        <SettingItemTab
          title={t('settings-account.avatar')}
          description={t('settings-account.avatar-description')}
        >
          <UserAvatar user={user} />
        </SettingItemTab>

        <Separator className="my-4" />

        <Suspense
          fallback={
            <SettingItemTab
              title={t('settings-account.display-name')}
              description={t('settings-account.display-name-description')}
            >
              <DisplayNameInput disabled />
            </SettingItemTab>
          }
        >
          <SettingItemTab
            title={t('settings-account.display-name')}
            description={t('settings-account.display-name-description')}
          >
            <DisplayNameInput defaultValue={user?.display_name} />
          </SettingItemTab>
        </Suspense>

        <Separator className="my-4" />

        <Suspense
          fallback={
            <SettingItemTab
              title="Email"
              description={t('settings-account.email-description')}
            >
              <EmailInput disabled />
            </SettingItemTab>
          }
        >
          <SettingItemTab
            title="Email"
            description={t('settings-account.email-description')}
          >
            <EmailInput oldEmail={user.email} newEmail={user.new_email} />
          </SettingItemTab>
        </Suspense>

        {/* Uncomment this section if you want to include the delete account option
          <Separator className="my-2" />

          <SettingItemTab
            title={t('settings-account.delete-account')}
            description={t('settings-account.delete-account-description')}
          >
            <Button
              variant="destructive"
              className="w-full"
            >
              {t('settings-account.delete-account')}
            </Button>
          </SettingItemTab>
          */}
      </div>
    </DialogContent>
  );
}
