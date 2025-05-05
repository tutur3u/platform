import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { DialogContent, DialogHeader, DialogTitle } from '@tuturuuu/ui/dialog';
import { ArrowRight } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Suspense } from 'react';

interface UserSettingsDialogProps {
  user: WorkspaceUser;
  wsId: string;
}

export default function UserSettingsDialog({
  wsId,
  user,
}: UserSettingsDialogProps) {
  const t = useTranslations();

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('settings-account.account')}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1 md:min-w-max md:max-w-lg">
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

        {/* <Separator className="my-4" />

        <Link href={`/${wsId}/settings/account`} className="w-full">
          <Button variant="outline" className="w-full">
            {t('settings-account.view-full-settings')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link> */}

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
