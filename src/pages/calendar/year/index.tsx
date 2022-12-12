import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { Center, SegmentedControl } from '@mantine/core';
import Link from 'next/link';
import { ReactElement, useEffect, useState } from 'react';
import Layout from '../../../components/layout/Layout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserData } from '../../../hooks/useUserData';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';

const YearViewPage: PageWithLayoutProps = () => {
  const {
    setRootSegment,
    changeLeftSidebarSecondaryPref,
    disablePadding,
    enablePadding,
  } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('visible');
    disablePadding();

    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });

    return () => {
      changeLeftSidebarSecondaryPref('hidden');
      enablePadding();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [date, setDate] = useState(new Date());

  const setToday = () => {
    setDate(new Date());
  };

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-8 flex justify-between">
        <div className="text-3xl font-semibold">
          <span>{date.getFullYear()}</span>
        </div>

        <div className="flex items-center justify-center gap-2 text-blue-300">
          <SegmentedControl
            radius="md"
            className="mr-2"
            data={[
              {
                value: 'week',
                label: (
                  <Center>
                    <Link href="/calendar">Week</Link>
                  </Center>
                ),
              },
              {
                value: 'month',
                label: (
                  <Center>
                    <Link href="/calendar/month">Month</Link>
                  </Center>
                ),
              },
              {
                value: 'year',
                label: (
                  <Center>
                    <Link href="/calendar/year">Year</Link>
                  </Center>
                ),
              },
            ]}
          />

          <button className="h-full rounded-lg p-2 text-3xl hover:bg-blue-300/20">
            <ChevronLeftIcon className="w-4" />
          </button>
          <button
            onClick={setToday}
            className="cursor-pointer rounded-lg p-2 text-lg font-semibold hover:bg-blue-300/20"
          >
            This year
          </button>
          <button className="h-full rounded-lg p-2 text-3xl hover:bg-blue-300/20">
            <ChevronRightIcon className="w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

YearViewPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default YearViewPage;
