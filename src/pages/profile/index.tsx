import { Avatar } from '@mantine/core';
import { ReactElement, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
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
      <div className="relative flex h-[30%] w-full items-center justify-center bg-zinc-700">
        <div className="absolute top-[60%] flex flex-col items-center justify-center gap-1 lg:top-[53%]">
          <Avatar
            color="indigo"
            radius="xl"
            className="mb-2 h-36 w-36 lg:h-40 lg:w-40"
          />
          <div className="text-3xl font-bold text-zinc-400">Display name</div>
          <div className="text-lg text-zinc-400">email@example.com</div>
        </div>
      </div>
    </div>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
