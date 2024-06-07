import SettingItemTab from '../../../../../components/settings/SettingItemTab';
import DisplayNameInput from './display-name-input';
import EmailInput from './email-input';
import { getCurrentUser } from '@/lib/user-helper';
import useTranslation from 'next-translate/useTranslation';
import { Suspense } from 'react';

export default async function AccountSettingsPage() {
  const { t } = useTranslation('settings-account');
  const user = await getCurrentUser();

  // const avatarLabel = t('avatar');
  // const avatarDescription = t('avatar-description');
  const displayNameLabel = t('display-name');
  const displayNameDescription = t('display-name-description');
  const emailDescription = t('email-description');

  return (
    <div className="grid gap-1 md:min-w-max md:max-w-lg">
      {/* <SettingItemTab title={avatarLabel} description={avatarDescription}>
        <Avatar user={user} />
      </SettingItemTab> */}

      <Suspense
        fallback={
          <SettingItemTab
            title={displayNameLabel}
            description={displayNameDescription}
          >
            <DisplayNameInput disabled />
          </SettingItemTab>
        }
      >
        <SettingItemTab
          title={displayNameLabel}
          description={displayNameDescription}
        >
          <DisplayNameInput defaultValue={user!?.display_name} />
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
          <SettingItemTab title="Email" description={emailDescription}>
            <EmailInput disabled />
          </SettingItemTab>
        }
      >
        <SettingItemTab title="Email" description={emailDescription}>
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
