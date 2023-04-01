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
import { useSessionContext } from '@supabase/auth-helpers-react';
import useTranslation from 'next-translate/useTranslation';

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

  useEffect(() => {
    if (user) {
      setDisplayName(user?.display_name || '');
      setUsername(user?.handle || '');
      setBirthday(user?.birthday ? moment(user?.birthday).toDate() : null);
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

  const router = useRouter();

  const { supabaseClient } = useSessionContext();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  const { t } = useTranslation('settings');

  const logOut = t('common:logout');

  return (
    <div className="grid min-h-full gap-4 pb-8 xl:grid-cols-2">
      <HeaderX label="Settings" />
      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">Display name</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Please enter your name as you would like it to be displayed on your
          profile.
        </div>

        <TextInput
          placeholder="John Doe"
          value={displayName}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setDisplayName(event.currentTarget.value)
          }
        />

        <Divider className="my-4" />
        <div
          onClick={handleSave}
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
        >
          {saving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">Handle</div>
        <div className="mb-4 font-semibold text-zinc-500">
          This is your custom URL namespace within Tuturuuu.
        </div>
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
        <Divider className="my-4" />
        <div
          onClick={handleSave}
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
        >
          {saving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">Birthday</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Your birthday will only be used for social features.
        </div>
        <DatePickerInput
          placeholder="Your birthday"
          icon={<CakeIcon className="h-5 w-5" />}
          value={birthday}
          onChange={setBirthday}
        />
        <Divider className="my-4" />
        <div
          onClick={handleSave}
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition duration-300 hover:border-blue-300/30 hover:bg-blue-300/20"
        >
          {saving ? 'Saving...' : 'Save'}
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">Email</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Your email address that you used to login with.
        </div>
        <TextInput
          placeholder="example@tuturuuu.com"
          value={user?.email || ''}
          icon={<EnvelopeIcon className="h-5 w-5" />}
          readOnly
          disabled
        />
        <Divider className="my-4" />
        <div className="flex cursor-not-allowed items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300/30">
          Coming soon
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">Language</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Change the language of the website
        </div>
        <LanguageSelector fullWidth />
      </div>

      <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
        <div className="mb-1 text-2xl font-bold">{logOut}</div>
        <div className="mb-4 font-semibold text-zinc-500">
          Log out of your account
        </div>

        <div
          onClick={handleLogout}
          className="col-span-full flex cursor-pointer items-center justify-center rounded border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
        >
          {logOut}
        </div>
      </div>
    </div>
  );
};

SettingPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="settings">{page}</NestedLayout>;
};

export default SettingPage;
