import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { ReactElement, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { useAppearance } from '../../hooks/useAppearance';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';

const CalendarPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekdays = ['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg bg-purple-300/10 p-5">
      <div className="mb-8 flex h-10 justify-between">
        <div className="text-2xl font-semibold">December 2022</div>
        <div className="flex items-center justify-center gap-3">
          <ChevronLeftIcon className="w-9 rounded-xl p-2 text-3xl hover:cursor-pointer hover:bg-zinc-500"></ChevronLeftIcon>
          <div className="cursor-pointer rounded-xl bg-zinc-500 p-2 text-lg font-semibold">
            Today
          </div>
          <ChevronRightIcon className="w-9 rounded-xl p-2 text-3xl hover:cursor-pointer hover:bg-zinc-500"></ChevronRightIcon>
        </div>
      </div>
      <div className="overflow-y-scroll text-center scrollbar-none">
        <div className="grid grid-cols-8">
          {weekdays.map((day) => (
            <div>
              <div className="flex h-16 items-center justify-center border border-zinc-700 text-lg font-semibold">
                {day}
              </div>
              {day === 'Time' ? (
                <div className="grid grid-rows-[24]">
                  {Array.from(Array(24).keys()).map((hour) => (
                    <div className="flex h-20 items-center justify-center border border-zinc-700">
                      {hour}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-rows-[24]">
                  {Array.from(Array(24).keys()).map((hour) => (
                    <div className="flex h-20 items-center justify-center border border-zinc-700"></div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
