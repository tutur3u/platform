import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { Checkbox, Divider, TextInput } from '@mantine/core';
import { useUser } from '../../hooks/useUser';
import { useSegments } from '../../hooks/useSegments';
import moment from 'moment';
import {
  AtSymbolIcon,
  CakeIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/solid';
import HeaderX from '../../components/metadata/HeaderX';
import { DatePickerInput } from '@mantine/dates';
import NestedLayout from '../../components/layouts/NestedLayout';
import LanguageSelector from '../../components/selectors/LanguageSelector';
import { useRouter } from 'next/router';
import {
  useSessionContext,
  useSupabaseClient,
} from '@supabase/auth-helpers-react';
import useTranslation from 'next-translate/useTranslation';
import { showNotification } from '@mantine/notifications';
import SettingItemTab from '../../components/settings/SettingItemTab';
import { enforceAuthenticated } from '../../utils/serverless/enforce-authenticated';
import { mutate } from 'swr';
import { useAppearance } from '../../hooks/useAppearance';
import { DEV_MODE } from '../../constants/common';
import { closeAllModals, openModal } from '@mantine/modals';
import AccountDeleteForm from '../../components/forms/AccountDeleteForm';
import { supabaseAdmin } from '../../utils/supabase/client';

export const getServerSideProps = enforceAuthenticated;

const SettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const {
    hideExperimentalOnSidebar,
    hideExperimentalOnTopNav,
    toggleHideExperimentalOnSidebar,
    toggleHideExperimentalOnTopNav,
  } = useAppearance();

  const { t } = useTranslation('settings-account');

  const settings = t('common:settings');
  const account = t('account');

  useEffect(() => {
    setRootSegment([
      {
        content: settings,
        href: '/settings',
      },
      {
        content: account,
        href: '/settings/account',
      },
    ]);
  }, [settings, account, setRootSegment]);

  const { user, updateUser } = useUser();

  const [isSaving, setIsSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [handle, setUsername] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (user) {
      setDisplayName(user?.display_name || '');
      setUsername(user?.handle || '');
      setBirthday(user?.birthday ? moment(user?.birthday).toDate() : null);
      setEmail(user?.email || '');
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);

    await updateUser?.({
      display_name: displayName,
      handle,
      birthday: birthday ? moment(birthday).format('YYYY-MM-DD') : null,
    });

    if (user?.email !== email) await handleChangeEmail();

    setIsSaving(false);
  };

  const supabase = useSupabaseClient();

  const handleChangeEmail = async () => {
    try {
      const { error } = await supabase.auth.updateUser({
        email,
      });

      if (error) throw new Error(error.message);
      mutate('/api/user');

      showNotification({
        title: 'Email changed successfully',
        message:
          'A confirmation email has been sent to your current and new email address. Please confirm your new email address to complete the change.',
        color: 'green',
      });
    } catch (e) {
      if (e instanceof Error)
        showNotification({
          title: 'Failed to change email',
          message: e.message || e.toString(),
          color: 'red',
        });
    }
  };

  const router = useRouter();

  const { supabaseClient } = useSessionContext();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/');
  };

  const handleDeleteAccount = async () => {
    try {
      const res = await fetch('/api/user', {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete account');

      showNotification({
        title: 'Account deleted',
        message: 'Your account has been deleted.',
        color: 'green',
      });

      closeAllModals();
      handleLogout();
    } catch (e) {
      if (e instanceof Error)
        showNotification({
          title: 'Failed to delete account',
          message: e.message || e.toString(),
          color: 'red',
        });
    }
  };

  const showDeleteModal = () => {
    if (!user) {
      showNotification({
        title: 'Error',
        message: 'No user',
        color: 'red',
      });
      return;
    }
    openModal({
      title: <div className="font-semibold">Confirm account deletion</div>,
      centered: true,
      children: (
        <AccountDeleteForm user={user} onDelete={handleDeleteAccount} />
      ),
    });
  };

  const logOut = t('common:logout');
  const save = t('common:save');
  const saving = t('common:saving');

  const displayNameLabel = t('display-name');
  const displayNameDescription = t('display-name-description');
  const handleDescription = t('handle-description');
  const birthdayLabel = t('birthday');
  const birthdayDescription = t('birthday-description');
  const birthdayPlaceholder = t('birthday-placeholder');
  const emailDescription = t('email-description');
  const newEmail = t('new-email');
  const currentEmail = t('current-email');
  const changeEmailDescription = t('change-email-description');
  const languageLabel = t('language');
  const languageDescription = t('language-description');
  const developmentLabel = t('development');
  const developmentDescription = t('development-description');
  const logoutDescription = t('logout-description');

  return (
    <div className="md:max-w-lg">
      <HeaderX label={settings} />

      <div className="grid gap-2">
        <SettingItemTab
          title={displayNameLabel}
          description={displayNameDescription}
        >
          <TextInput
            placeholder="John Doe"
            value={displayName}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDisplayName(event.currentTarget.value)
            }
          />
        </SettingItemTab>

        <SettingItemTab title="Handle" description={handleDescription}>
          <TextInput
            placeholder="tuturuuu"
            // replace all characters that are not a-z, 0-9, or _
            value={handle.replace(/[^a-z0-9_]/gi, '').toLowerCase()}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const handle = event.currentTarget.value.replace(
                /[^a-z0-9_]/gi,
                ''
              );

              // Limit to 20 characters
              if (handle.length > 20) return;
              setUsername(handle.toLowerCase());
            }}
            icon={<AtSymbolIcon className="h-5 w-5" />}
          />
        </SettingItemTab>

        <SettingItemTab title={birthdayLabel} description={birthdayDescription}>
          <DatePickerInput
            placeholder={birthdayPlaceholder}
            icon={<CakeIcon className="h-5 w-5" />}
            value={birthday}
            onChange={setBirthday}
            classNames={{
              input: 'dark:bg-[#25262b]',
            }}
          />
        </SettingItemTab>

        <SettingItemTab title="Email" description={emailDescription}>
          <div className="grid gap-2">
            <TextInput
              placeholder="example@tuturuuu.com"
              label={
                user?.new_email
                  ? user?.email === email
                    ? currentEmail
                    : newEmail
                  : undefined
              }
              value={email || ''}
              icon={<EnvelopeIcon className="h-5 w-5" />}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setEmail(event.currentTarget.value)
              }
            />

            {user?.email === email && user?.new_email && (
              <>
                <TextInput
                  value={user.new_email}
                  label={newEmail}
                  icon={<EnvelopeIcon className="h-5 w-5" />}
                  disabled
                />

                <Divider variant="dashed" className="mt-1" />

                <div className="text-zinc-700 dark:text-zinc-400">
                  {changeEmailDescription}
                </div>
              </>
            )}
          </div>
        </SettingItemTab>

        <div
          onClick={handleSave}
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-600 transition duration-300 hover:border-blue-500/30 hover:bg-blue-500/20 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:border-blue-300/30 dark:hover:bg-blue-300/20"
        >
          {isSaving ? saving : save}
        </div>

        <Divider variant="dashed" className="my-2" />

        <SettingItemTab title={languageLabel} description={languageDescription}>
          <LanguageSelector fullWidth />
        </SettingItemTab>

        {DEV_MODE ? (
          <>
            <Divider className="my-2" />
            <SettingItemTab
              title={developmentLabel}
              description={developmentDescription}
            >
              <div className="grid gap-2">
                <Checkbox
                  label={t('hide-experimental-on-sidebar')}
                  checked={hideExperimentalOnSidebar}
                  onChange={toggleHideExperimentalOnSidebar}
                />
                <Checkbox
                  label={t('hide-experimental-on-top-nav')}
                  checked={hideExperimentalOnTopNav}
                  onChange={toggleHideExperimentalOnTopNav}
                />
              </div>
            </SettingItemTab>
          </>
        ) : null}

        <Divider className="my-2" />

        <SettingItemTab title={logOut} description={logoutDescription}>
          <div
            onClick={handleLogout}
            className="col-span-full flex cursor-pointer items-center justify-center rounded border border-red-500/20 bg-red-500/10 p-2 font-semibold text-red-600 transition duration-300 hover:border-red-500/30 hover:bg-red-500/20 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:border-red-300/30 dark:hover:bg-red-300/20"
          >
            {logOut}
          </div>
        </SettingItemTab>

        <Divider className="my-2" />

        <SettingItemTab
          title="Delete account"
          description="Delete your account."
        >
          <div
            onClick={showDeleteModal}
            className="col-span-full flex cursor-pointer items-center justify-center rounded border border-red-500/20 bg-red-500/10 p-2 font-semibold text-red-600 transition duration-300 hover:border-red-500/30 hover:bg-red-500/20 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:border-red-300/30 dark:hover:bg-red-300/20"
          >
            Delete account
          </div>
        </SettingItemTab>
      </div>
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default SettingPage;
