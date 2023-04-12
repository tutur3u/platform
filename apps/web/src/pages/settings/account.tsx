import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { TextInput } from '@mantine/core';
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
import SettingItemCard from '../../components/settings/SettingItemCard';
import { showNotification } from '@mantine/notifications';
import { enforceAuthenticated } from '../../utils/serverless/enforce-authenticated';

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

  const [saving, setSaving] = useState(false);

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
    setSaving(true);

    await updateUser?.({
      display_name: displayName,
      handle,
      birthday: birthday ? moment(birthday).format('YYYY-MM-DD') : null,
    });

    setSaving(false);
  };

  const supabase = useSupabaseClient();

  const handleChangeEmail = async () => {
    try {
      await supabase.auth.updateUser({
        email,
      });

      showNotification({
        title: 'Change email',
        message:
          'A confirmation email has been sent to your current and new email address. Please confirm your new email address to complete the change.',
        color: 'green',
      });
    } catch (e) {
      if (e instanceof Error)
        showNotification({
          title: 'Error',
          message: e.message,
          color: 'red',
        });
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

  return (
    <div className="grid gap-4 pb-8 lg:grid-cols-2 xl:grid-cols-3">
      <HeaderX label="Settings" />

      <SettingItemCard
        title="Display name"
        description="Please enter your name as you would like it to be displayed on your profile."
        saving={saving}
        onSave={handleSave}
      >
        <TextInput
          placeholder="John Doe"
          value={displayName}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setDisplayName(event.currentTarget.value)
          }
        />
      </SettingItemCard>

      <SettingItemCard
        title="Handle"
        description="This is your custom URL namespace within Tuturuuu."
        saving={saving}
        onSave={handleSave}
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
      </SettingItemCard>

      <SettingItemCard
        title="Birthday"
        description="Your birthday will only be used for social features."
        saving={saving}
        onSave={handleSave}
      >
        <DatePickerInput
          placeholder="Your birthday"
          icon={<CakeIcon className="h-5 w-5" />}
          value={birthday}
          onChange={setBirthday}
        />
      </SettingItemCard>

      <SettingItemCard
        title="Email"
        description="Your email address that you used to login with."
        saving={saving}
        onSave={handleChangeEmail}
      >
        <TextInput
          placeholder="example@tuturuuu.com"
          value={email || ''}
          icon={<EnvelopeIcon className="h-5 w-5" />}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setEmail(event.currentTarget.value)
          }
        />
      </SettingItemCard>

      <SettingItemCard
        title="Language"
        description="Change the language of the website."
      >
        <LanguageSelector fullWidth />
      </SettingItemCard>

      <SettingItemCard title={logOut} description="Log out of your account.">
        <div
          onClick={handleLogout}
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
        >
          {logOut}
        </div>
      </SettingItemCard>
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default SettingPage;
