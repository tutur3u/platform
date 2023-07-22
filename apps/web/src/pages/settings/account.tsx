import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import {
  Checkbox,
  Divider,
  FileInput,
  TextInput,
  Avatar,
  ActionIcon,
} from '@mantine/core';
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
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { IconSettings } from '@tabler/icons-react';
import { closeAllModals, openModal } from '@mantine/modals';
import AccountDeleteForm from '../../components/forms/AccountDeleteForm';
import Link from 'next/link';

export const getServerSideProps = enforceAuthenticated;

const SettingPage: PageWithLayoutProps = () => {
  const supabase = useSupabaseClient();
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

  const { user, updateUser, uploadImageUserBucket } = useUser();
  const { ws } = useWorkspaces();
  const [isSaving, setIsSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [handle, setUsername] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [email, setEmail] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user?.display_name || '');
      setUsername(user?.handle || '');
      setBirthday(user?.birthday ? moment(user?.birthday).toDate() : null);
      setEmail(user?.email || '');
      setAvatarUrl(user?.avatar_url || '');
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    let newAvatarUrl = avatarUrl;
    const hasNewAvatar = avatarFile !== null;

    if (hasNewAvatar) {
      newAvatarUrl = (await uploadImageUserBucket?.(avatarFile)) ?? null;
    }
    await updateUser?.({
      display_name: displayName,
      handle,
      avatar_url: newAvatarUrl,
      birthday: birthday ? moment(birthday).format('YYYY-MM-DD') : null,
    });

    if (user?.email !== email) {
      await handleChangeEmail();
    }

    if (hasNewAvatar && ws?.id) {
      await mutate(`/api/workspaces/${ws.id}/members?page=1&itemsPerPage=4`);
    }

    setIsSaving(false);
  };

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
      title: (
        <div className="font-semibold">{t('confirm-account-deletion')}</div>
      ),
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
  const chanegPasswordLabel = t('change-password');
  const chanegPasswordDescription = t('change-password-description');
  const deleteAccountLabel = t('delete-account');
  const deleteAccountDescription = t('delete-account-description');

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <HeaderX label={settings} />

      <div className="grid gap-1 md:min-w-max md:max-w-lg">
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

        <SettingItemTab>
          <div className=" relative block h-fit w-[16rem] s1131:hidden">
            <FileInput
              accept="image/png,image/jpeg"
              value={null}
              className="absolute right-2 top-8 z-10 flex h-[2rem] w-[2rem] items-center justify-center rounded-md
            hover:bg-blue-500/10"
              onChange={setAvatarFile}
              variant="unstyled"
              icon={
                <ActionIcon variant="subtle" color="blue" className="">
                  <IconSettings size="1.5rem" />
                </ActionIcon>
              }
            />

            <Avatar
              alt="Avatar"
              src={avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl}
              size="2xl"
              className="h-[16rem] w-[16rem] max-w-sm rounded-full "
            />
            {avatarFile && (
              <div className="absolute bottom-[-0.5rem] left-0 right-0 mx-auto flex  w-[6rem] transform items-center justify-center rounded-full bg-clip-text backdrop-blur">
                <div className="w-full rounded-full border  border-blue-300/10  bg-blue-300/10 bg-clip-padding  py-2 text-center font-semibold text-blue-300">
                  Preview
                </div>
              </div>
            )}
          </div>
        </SettingItemTab>

        <SettingItemTab title="Handle" description={handleDescription}>
          <TextInput
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

        <Divider variant="dashed" className="my-2" />

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

        <SettingItemTab
          title={chanegPasswordLabel}
          description={chanegPasswordDescription}
        >
          <div className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-500/20 bg-blue-500/10 p-2 font-semibold text-blue-600 transition duration-300 hover:border-blue-500/30 hover:bg-blue-500/20 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:border-blue-300/30 dark:hover:bg-blue-300/20">
            <Link href="/reset-password">{chanegPasswordLabel}</Link>
          </div>
        </SettingItemTab>

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
          title={deleteAccountLabel}
          description={deleteAccountDescription}
        >
          <div
            onClick={showDeleteModal}
            className="col-span-full flex cursor-pointer items-center justify-center rounded border border-red-500/20 bg-red-500/10 p-2 font-semibold text-red-600 transition duration-300 hover:border-red-500/30 hover:bg-red-500/20 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:border-red-300/30 dark:hover:bg-red-300/20"
          >
            {deleteAccountLabel}
          </div>
        </SettingItemTab>
      </div>

      <div className=" relative hidden h-fit w-[16rem] s1131:block">
        <FileInput
          accept="image/png,image/jpeg"
          value={null}
          className="absolute right-2 top-8 z-10 flex h-[2rem] w-[2rem] items-center justify-center rounded-md
            hover:bg-blue-500/10"
          onChange={setAvatarFile}
          variant="unstyled"
          icon={
            <ActionIcon variant="subtle" color="blue" className="">
              <IconSettings size="1.5rem" />
            </ActionIcon>
          }
        />

        <Avatar
          alt="Avatar"
          src={avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl}
          size="2xl"
          className="h-[16rem] w-[16rem] max-w-sm rounded-full "
        />
        {avatarFile && (
          <div className="absolute bottom-[-0.5rem] left-0 right-0 mx-auto flex  w-[6rem] transform items-center justify-center rounded-full bg-clip-text backdrop-blur">
            <div className="w-full rounded-full border  border-blue-300/10  bg-blue-300/10 bg-clip-padding  py-2 text-center font-semibold text-blue-300">
              Preview
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default SettingPage;
