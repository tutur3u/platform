import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { Divider, TextInput } from '@mantine/core';
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

export const getServerSideProps = enforceAuthenticated;

const SettingPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment([
      {
        content: 'Settings',
        href: '/settings',
      },
      {
        content: 'Account',
        href: '/settings/account',
      },
    ]);
  }, [setRootSegment]);

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

    setIsSaving(false);
  };

  const supabase = useSupabaseClient();

  const [changingEmail, setChangingEmail] = useState(false);

  const handleChangeEmail = async () => {
    try {
      setChangingEmail(true);

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
    } finally {
      setChangingEmail(false);
    }
  };

  const router = useRouter();

  const { supabaseClient } = useSessionContext();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  const { t } = useTranslation('settings');

  const logOut = t('common:logout');
  const save = t('common:save');
  const saving = t('common:saving');

  return (
    <div className="md:max-w-md">
      <HeaderX label="Settings" />

      <div className="flex flex-col gap-5">
        <SettingItemTab
          title="Display name"
          description="Please enter your name as you would like it to be displayed on your profile."
        >
          <TextInput
            placeholder="John Doe"
            value={displayName}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setDisplayName(event.currentTarget.value)
            }
          />
        </SettingItemTab>

        <SettingItemTab
          title="Handle"
          description="This is your custom URL namespace within Tuturuuu."
        >
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

        <SettingItemTab
          title="Birthday"
          description="Your birthday will only be used for social features."
        >
          <DatePickerInput
            placeholder="Your birthday"
            icon={<CakeIcon className="h-5 w-5" />}
            value={birthday}
            onChange={setBirthday}
          />
        </SettingItemTab>
        
        <SettingItemTab
        title="Email"
        description="Your email address that you used to login with."
        saving={changingEmail}
        onSave={user?.email !== email ? handleChangeEmail : undefined}
      >
        <div className="grid gap-2">
          <TextInput
            placeholder="example@tuturuuu.com"
            label={
              user?.new_email
                ? user?.email === email
                  ? 'Current email'
                  : 'New email'
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
                label="New email"
                icon={<EnvelopeIcon className="h-5 w-5" />}
                disabled
              />

              <Divider variant="dashed" className="mt-1" />

              <div className="text-zinc-400">
                Once you have confirmed the change on both emails, your new
                email address will be automatically applied.
              </div>
            </>
          )}
        </div>
      </SettingItemTab>

        <SettingItemTab
          title="Language"
          description="Change the language of the website."
        >
          <LanguageSelector fullWidth />
        </SettingItemTab>
      <SettingItemCard title={logOut} description="Log out of your account.">
        <div
          onClick={handleSave}
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
        >
          {isSaving ? saving : save}
        </div>

        <SettingItemTab
          title="Email"
          description="Your email address that you used to login with."
        >
          <div className="flex gap-4">
            <TextInput
              placeholder="example@tuturuuu.com"
              value={email || ''}
              icon={<EnvelopeIcon className="h-5 w-5" />}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setEmail(event.currentTarget.value)
              }
              className="w-3/4"
            />
            <div
              onClick={handleChangeEmail}
              className="col-span-full flex w-1/4 cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-1 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
            >
              {save}
            </div>
          </div>
        </SettingItemTab>

        <SettingItemTab title={logOut} description="Log out of your account.">
          <div
            onClick={handleLogout}
            className="col-span-full flex cursor-pointer items-center justify-center rounded border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
          >
            {logOut}
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
