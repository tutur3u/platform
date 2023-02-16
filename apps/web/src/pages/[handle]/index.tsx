import {
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';
import { Avatar, Textarea } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import Image from 'next/image';
import { KeyboardEvent, ReactElement, useEffect, useState } from 'react';
import ProfileCard from '../../components/profile/ProfileCard';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { getInitials } from '../../utils/name-helper';
import useSWR, { mutate } from 'swr';
import { useDebouncedValue } from '@mantine/hooks';
import HeaderX from '../../components/metadata/HeaderX';
import SidebarLayout from '../../components/layouts/SidebarLayout';

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  // Create authenticated Supabase Client
  const supabase = createServerSupabaseClient(ctx);

  // Check if we have a session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };

  const { handle } = ctx?.params as { handle: string };

  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, display_name, birthday, created_at')
    .eq('username', handle)
    .single();

  if (error) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      initialSession: session,
      user,
    },
  };
}

interface ProfilePageParams {
  user: {
    id: string;
    username: string;
    display_name: string;
    birthday: string;
    created_at: string;
  };
}

const ProfilePage: PageWithLayoutProps<ProfilePageParams> = ({
  user,
}): ReactElement => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');

    setRootSegment({
      content: 'Calendar',
      href: '/finance',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDaysUntilBirthday = (birthday: Date) => {
    const today = new Date();
    const nextBirthday = new Date(
      today.getFullYear(),
      birthday.getMonth(),
      birthday.getDate()
    );

    if (today > nextBirthday) {
      nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
    }

    const daysUntilBirthday = Math.ceil(
      (nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysUntilBirthday;
  };

  const birthday = new Date(user.birthday);

  const { data: userData } = useUserData();

  const { data: personalNote, error: personalNoteError } = useSWR(
    userData?.id && user?.id
      ? `/api/users/${userData.id}/notes/people/${user.id}`
      : null
  );

  const noteLoading = !personalNote && !personalNoteError;

  const [note, setNote] = useState<string>('');
  const [debouncedNote] = useDebouncedValue(note, 1000);

  const [lastSavedNote, setLastSavedNote] = useState<string>('');

  const [loadedNote, setLoadedNote] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    if (!noteLoading && !loadedNote) {
      setNote(personalNote?.content || '');
      setLastSavedNote(personalNote?.content || '');
      setLoadedNote(true);
      setSaved(true);
    }
  }, [noteLoading, loadedNote, personalNote]);

  useEffect(() => {
    if (!userData?.id || !user?.id) return;
    mutate(`/api/users/${userData?.id}/notes/people/${user.id}`);

    return () => {
      setNote('');
      setLastSavedNote('');
      setLoadedNote(false);
      setSaved(false);
    };
  }, [userData?.id, user?.id]);

  const [saving, setSaving] = useState(false);

  const handleNoteSave = async (note: string) => {
    if (!loadedNote || noteLoading || saving || !userData) return;
    setSaving(true);

    const response = await fetch(
      `/api/users/${userData.id}/notes/people/${user.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: note,
        }),
      }
    );

    setSaving(false);

    if (!response.ok) {
      showNotification({
        title: 'Error',
        message: 'Failed to save note',
        color: 'red',
      });

      return;
    }

    setSaved(true);
    setLastSavedNote(note);
    mutate(`/api/users/${userData.id}/notes/people/${user.id}`);
  };

  useEffect(() => {
    if (debouncedNote !== lastSavedNote) {
      setSaved(false);
      handleNoteSave(debouncedNote);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedNote, lastSavedNote]);

  const handleKeyUp = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.shiftKey) {
      setSaved(lastSavedNote === note);
      setNote(event.currentTarget.value);
    }
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await handleNoteSave(note);
    }
  };

  return (
    <>
      <HeaderX
        label={`${user?.username} ${
          user?.display_name ? `(${user?.display_name})` : ''
        }`}
      />
      <div className="absolute inset-0 top-[4.5rem] flex h-full w-full flex-col border-zinc-800 md:static">
        <div className="relative flex h-64 items-center justify-center">
          <div className="m-4 max-h-64 w-full overflow-hidden rounded-lg md:mt-14">
            <Image
              src="/media/background/placeholder.jpg"
              alt="Profile background"
              width={1640}
              height={924}
              className="w-full object-cover"
            />
          </div>

          <div className="absolute top-32 flex flex-col items-center justify-center gap-1 md:top-40 lg:top-48">
            <Avatar radius="xl" className="h-40 w-40 bg-[#182a3d]">
              <div className="text-6xl text-[#a5d8ff]">
                {getInitials(user.display_name)}
              </div>
            </Avatar>
            <div className="text-3xl font-bold text-zinc-300">
              {user.display_name}
            </div>
            <div className="text-lg font-semibold text-purple-300">
              @{user.username}
            </div>
          </div>
        </div>

        <div className="grid translate-y-28 grid-cols-1 gap-4 p-4 md:grid-cols-2 md:p-8 lg:translate-y-48 lg:grid-cols-3 lg:pt-0 2xl:grid-cols-4">
          {user?.birthday && (
            <ProfileCard
              title="Birthday"
              titleClassname="text-green-200"
              classname="bg-green-300/20 transition duration-500"
            >
              <div className="mt-4 text-4xl font-bold text-green-300">
                {birthday.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div className="mt-2 text-lg font-semibold text-green-200/80">
                in {getDaysUntilBirthday(birthday)} days
              </div>
            </ProfileCard>
          )}

          <div className="rounded-lg bg-yellow-300/20 p-4 text-black transition duration-500">
            <div className="flex justify-between">
              <div className="text-2xl font-bold text-yellow-200">Note</div>
              <div
                className={`flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold ${
                  saved
                    ? 'bg-yellow-300/20 text-yellow-300'
                    : saving
                    ? 'bg-purple-300/20 text-purple-300'
                    : 'bg-zinc-300/20 text-zinc-300'
                }`}
              >
                <div>
                  {noteLoading
                    ? 'Loading'
                    : saving
                    ? 'Saving'
                    : saved
                    ? 'Saved'
                    : 'Unsaved'}
                </div>
                {noteLoading || saving ? (
                  <ArrowPathIcon
                    className={`inline-block h-5 w-5 animate-spin ${
                      saving ? 'text-purple-300' : 'text-zinc-300'
                    }`}
                  />
                ) : saved ? (
                  <CheckCircleIcon className="inline-block h-5 w-5" />
                ) : (
                  <XCircleIcon className="inline-block h-5 w-5" />
                )}
              </div>
            </div>
            <Textarea
              size="md"
              autosize
              minRows={3}
              maxRows={10}
              variant="unstyled"
              placeholder="Add a personal note about this person..."
              classNames={{
                input:
                  'text-yellow-300 placeholder-yellow-300/50 font-semibold',
              }}
              value={note}
              onChange={(event) => {
                const newNote = event.currentTarget.value;

                setNote(newNote);
                setSaved(lastSavedNote === newNote);
              }}
              onKeyUp={handleKeyUp}
              onKeyDown={handleKeyDown}
              disabled={!user || !userData || !loadedNote}
            />
          </div>
        </div>
      </div>
    </>
  );
};

ProfilePage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default ProfilePage;
