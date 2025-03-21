import UserAvatar from '../../../settings-avatar';
import DisplayNameInput from '../../../settings-display-name-input';
import EmailInput from '../../../settings-email-input';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { Separator } from '@tuturuuu/ui/separator';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

export default async function AccountSettingsPage() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  return (
    <div className="grid gap-1 md:max-w-lg md:min-w-max">
      <SettingItemTab
        title={t('settings-account.avatar')}
        description={t('settings-account.avatar-description')}
      >
        {user && <UserAvatar user={user} />}
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

      {/* <SettingItemTab title="Handle" description={handleDescription}>
        <Input
          placeholder="tuturuuu"
          // replace all characters that are not a-z, 0-9, underscore(_), or dash(-) with empty string
          value={handle.replace(/[^a-z0-9_-]/gi, '').toLowerCase()}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const handle = event.currentTarget.value.replace(
              /[^a-z0-9_-]/gi,
              ''
            );

            // Limit to 20 characters
            if (handle.length > 20) return;
            setUsername(handle.toLowerCase());
          }}
        />
      </SettingItemTab> */}

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
          <EmailInput oldEmail={user!?.email} newEmail={user!?.new_email} />
        </SettingItemTab>
      </Suspense>

      {/* <Separator className="my-2" />

      <SettingItemTab
        title={deleteAccountLabel}
        description={deleteAccountDescription}
      >
        <Button
          className="flex w-full cursor-pointer items-center justify-center rounded border border-red-500/20 bg-red-500/10 p-2 font-semibold text-red-600 transition duration-300 hover:border-red-500/30 hover:bg-red-500/20 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:border-red-300/30 dark:hover:bg-red-300/20"
        >
          {deleteAccountLabel}
        </Button>
      </SettingItemTab> */}
    </div>
  );
}
