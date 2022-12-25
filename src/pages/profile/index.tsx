import { Avatar, Textarea } from '@mantine/core';
import { ReactElement, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import ProfileCard from '../../components/profile/ProfileCard';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';

const CalendarPage: PageWithLayoutProps = () => {
  const {
    setRootSegment,
    changeLeftSidebarSecondaryPref,
    disablePadding,
    enablePadding,
  } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');
    disablePadding();

    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });

    return () => {
      enablePadding();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="flex h-full w-full flex-col border-zinc-800 bg-zinc-900">
      <div className="relative flex h-[30%] items-center justify-center bg-zinc-700">
        <div className="absolute top-[60%] flex flex-col items-center justify-center gap-1 lg:top-[53%]">
          <div>
            <Avatar
              radius="xl"
              className="mb-2 h-36 w-36 bg-blue-300 lg:h-40 lg:w-40"
            />
          </div>
          <div className="text-3xl font-bold text-zinc-400">Display name</div>
          <div className="text-lg text-zinc-400">username</div>
        </div>
      </div>
      <div className="grid translate-y-36 grid-cols-2 gap-8 p-8 lg:translate-y-36 lg:grid-cols-3 lg:pt-0 xl:grid-cols-4">
        <ProfileCard title="Birthday" classname="bg-yellow-200/70 h-36">
          <div className="mt-8 text-4xl font-bold">July 2</div>
          <div className="mt-2 text-lg">in 150 days</div>
        </ProfileCard>
        <ProfileCard title="Info" classname="bg-red-200/70">
          <div>Born on July 2, 1999</div>
        </ProfileCard>
        <ProfileCard title="Info" classname="bg-blue-200/70">
          <div>Born on July 2, 1999</div>
          <div>Born on July 2, 1999</div>
          <div>Born on July 2, 1999</div>
        </ProfileCard>
        <ProfileCard title="Info" classname="bg-green-200/70">
          <div>Born on July 2, 1999</div>
        </ProfileCard>
        <ProfileCard title="Info" classname="bg-purple-200/70">
          <div>Born on July 2, 1999</div>
          <div>Born on July 2, 1999</div>
          <div>Born on July 2, 1999</div>
          <div>Born on July 2, 1999</div>
        </ProfileCard>
        <ProfileCard title="Note" classname="bg-yellow-200/70">
          <Textarea
            autosize
            size="md"
            minRows={7}
            placeholder="Write a note about this user... Enter to save note."
          />
        </ProfileCard>
      </div>
    </div>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
