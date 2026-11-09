import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { DialogContent, DialogHeader, DialogTitle } from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';

interface UserSettingsDialogProps {
  user: WorkspaceUser;
}

export default function UserSettingsDialog({ user }: UserSettingsDialogProps) {
  const t = useTranslations();

  return (
    <DialogContent className="settings-surface">
      <DialogHeader>
        <DialogTitle>{t('settings-account.account')}</DialogTitle>
      </DialogHeader>
      <SettingsSection className="md:max-w-lg">
        <SettingItemTab
          title={t('settings-account.avatar')}
          description={t('settings-account.avatar-description')}
        >
          <UserAvatar user={user} />
        </SettingItemTab>

        <Suspense
          fallback={
            <SettingItemTab
              layout="stacked"
              title={t('settings-account.display-name')}
              description={t('settings-account.display-name-description')}
            >
              <DisplayNameInput disabled />
            </SettingItemTab>
          }
        >
          <SettingItemTab
            layout="stacked"
            title={t('settings-account.display-name')}
            description={t('settings-account.display-name-description')}
          >
            <DisplayNameInput defaultValue={user?.display_name} />
          </SettingItemTab>
        </Suspense>

        <Suspense
          fallback={
            <SettingItemTab
              layout="stacked"
              title="Email"
              description={t('settings-account.email-description')}
            >
              <EmailInput disabled />
            </SettingItemTab>
          }
        >
          <SettingItemTab
            layout="stacked"
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
      </SettingsSection>
    </DialogContent>
  );
}
