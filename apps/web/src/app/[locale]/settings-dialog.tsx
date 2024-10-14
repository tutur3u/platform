import UserAvatar from './settings-avatar';
import DisplayNameInput from './settings-display-name-input';
import EmailInput from './settings-email-input';
import SettingItemTab from '@/components/settings/SettingItemTab';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { Separator } from '@repo/ui/components/ui/separator';
import { useTranslations } from 'next-intl';
import React, { Suspense } from 'react';

interface UserSettingsDialogProps {
  trigger: React.ReactNode;
  user: WorkspaceUser;
}

export default async function UserSettingsDialog({
  trigger,
  user,
}: UserSettingsDialogProps) {
  const t = useTranslations();

  if (!user) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account settings</DialogTitle>
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
    </Dialog>
  );
}
