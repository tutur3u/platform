import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { Button } from '@ncthub/ui/button';
import { SettingItemTab } from '@ncthub/ui/custom/settings-item-tab';
import { DialogContent, DialogHeader, DialogTitle } from '@ncthub/ui/dialog';
import { ArrowRight } from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
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

        <Separator className="my-4" />

        <Link href="/settings/account" className="w-full">
          <Button variant="outline" className="w-full">
            {t('settings-account.view-full-settings')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>

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
