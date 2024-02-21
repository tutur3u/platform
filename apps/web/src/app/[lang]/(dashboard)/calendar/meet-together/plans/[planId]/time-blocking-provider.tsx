'use client';

import {
  ReactNode,
  Touch,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import minMax from 'dayjs/plugin/minMax';
import { User as PlatformUser } from '@/types/primitives/User';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Timeblock } from '@/types/primitives/Timeblock';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { timeToTimetz } from '@/utils/date-helper';

dayjs.extend(isBetween);
dayjs.extend(minMax);

interface GuestUser {
  id: string;
  display_name?: string;
  passwordHash?: string;
  is_guest?: boolean;
}

interface EditingParams {
  enabled: boolean;
  mode?: 'add' | 'remove';
  initialTouch?: { x: number; y: number };
  startDate?: Date;
  endDate?: Date;
}

const TimeBlockContext = createContext({
  user: null as PlatformUser | GuestUser | null,
  selectedTimeBlocks: [] as Timeblock[],
  editing: {
    enabled: false,
  } as EditingParams,
  showLogin: false as boolean,
  showAccountSwitcher: false as boolean,
  setUser: (_: PlatformUser | GuestUser | null) => {},
  setSelectedTimeBlocks: (_: Timeblock[]) => {},
  edit: (_: { mode: 'add' | 'remove'; date: Date }, __?: any) => {},
  endEditing: () => {},
  setShowLogin: (_: boolean) => {},
  setShowAccountSwitcher: (_: boolean) => {},
});

const TimeBlockingProvider = ({
  platformUser,
  plan,
  timeblocks,
  children,
}: {
  platformUser: PlatformUser | null;
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  children: ReactNode;
}) => {
  const [selectedTimeBlocks, setSelectedTimeBlocks] =
    useState<Timeblock[]>(timeblocks);

  const [editing, setEditing] = useState<EditingParams>({
    enabled: false,
  });

  const [user, setUser] = useState<PlatformUser | GuestUser | null>(
    platformUser
  );
  const [showLogin, setShowLogin] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

  const edit = (
    { mode, date }: { mode: 'add' | 'remove'; date: Date },
    event?: any
  ) => {
    const touch = event?.touches?.[0] as Touch | undefined;

    setEditing((prevData) => {
      const nextMode = prevData?.mode === undefined ? mode : prevData.mode;
      const nextTouch =
        prevData?.initialTouch === undefined
          ? touch
            ? {
                x: touch.clientX,
                y: touch.clientY,
              }
            : undefined
          : prevData.initialTouch;

      const nextStart =
        prevData?.startDate === undefined ? date : prevData.startDate;

      const touchXDiff =
        (touch?.clientX || 0) - (prevData?.initialTouch?.x || 0);

      const touchYDiff =
        (touch?.clientY || 0) - (prevData?.initialTouch?.y || 0);

      const nextEnd =
        prevData?.initialTouch !== undefined && nextTouch
          ? nextStart
            ? dayjs(nextStart)
                .add(Math.floor((touchYDiff / 15) * 1.25) * 15, 'minute')
                .add(Math.floor(touchXDiff / 15 / 3), 'day')
                .toDate()
            : nextStart
          : date;

      return {
        enabled: true,
        mode: nextMode,
        startDate: nextStart,
        endDate: nextEnd,
        initialTouch: nextTouch,
      };
    });
  };

  const convertDurationToTimeblocks = (
    startDate?: Date,
    endDate?: Date
  ): Timeblock[] => {
    if (!startDate || !endDate) return [];

    const timeblocks = [];

    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const date = currentDate.toISOString().split('T')[0];

      const startTime = dayjs(startDate).format('HH:mm');
      const endTime = dayjs(endDate).add(15, 'minute').format('HH:mm');

      timeblocks.push({
        date,
        start_time: timeToTimetz(startTime),
        end_time: timeToTimetz(endTime),
      });

      // Increment the date
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return timeblocks;
  };

  const endEditing = () => {
    if (editing.startDate === undefined || editing.endDate === undefined)
      return;

    const editingStartDate =
      editing.startDate.getTime() < editing.endDate.getTime()
        ? editing.startDate
        : editing.endDate;

    const editingEndDate =
      editing.startDate.getTime() < editing.endDate.getTime()
        ? editing.endDate
        : editing.startDate;

    const extraTimeblocks = convertDurationToTimeblocks(
      editingStartDate,
      editingEndDate
    );

    console.log('editing', editing);

    setSelectedTimeBlocks((prevTimeblocks) => {
      if (editing.mode === 'add') {
        // Concat the new timeblocks
        const newTimeblocks = prevTimeblocks.concat(extraTimeblocks);

        // Sort the timeblocks by start time and date
        const sortedTimeblocks = newTimeblocks.sort((a, b) => {
          const aTime = dayjs(`${a.date} ${a.start_time}`);
          const bTime = dayjs(`${b.date} ${b.start_time}`);
          return aTime.diff(bTime);
        });

        let nextTBs: Timeblock[] = [];

        for (let i = 0; i < sortedTimeblocks.length; i++) {
          const lastTB = nextTBs[nextTBs.length - 1];
          const currTB = sortedTimeblocks[i];

          // If nextTBs is empty, add the current timeblock
          if (nextTBs.length === 0) {
            nextTBs.push(currTB);
            continue;
          }

          // If currTB is in the middle of lastTB,
          // skip the current timeblock
          if (
            dayjs(`${currTB.date} ${currTB.start_time}`).isBetween(
              dayjs(`${lastTB.date} ${lastTB.start_time}`),
              dayjs(`${lastTB.date} ${lastTB.end_time}`),
              null,
              '[]'
            ) &&
            dayjs(`${currTB.date} ${currTB.end_time}`).isBetween(
              dayjs(`${lastTB.date} ${lastTB.start_time}`),
              dayjs(`${lastTB.date} ${lastTB.end_time}`),
              null,
              '[]'
            )
          ) {
            continue;
          }

          // If lastTB's end time is greater than or equal to currTB's start time,
          // set lastTB's end time to max of lastTB's end time and currTB's end time
          if (
            `${lastTB.date} ${lastTB.end_time}` ===
              `${currTB.date} ${currTB.start_time}` ||
            dayjs(`${lastTB.date} ${lastTB.end_time}`).isAfter(
              dayjs(`${currTB.date} ${currTB.start_time}`)
            )
          ) {
            lastTB.end_time = currTB.end_time;
            continue;
          }

          // If none of the above conditions are met, add the current timeblock
          nextTBs.push(currTB);
        }

        console.log('[ADD] timeblocks', nextTBs);
        return nextTBs;
      }

      if (editing.mode === 'remove') {
        // Sort the timeblocks by start time and date
        const sortedTimeblocks = prevTimeblocks.sort((a, b) => {
          const aTime = dayjs(`${a.date} ${a.start_time}`);
          const bTime = dayjs(`${b.date} ${b.start_time}`);
          return aTime.diff(bTime);
        });

        const nextTBs: Timeblock[] = [];

        for (let i = 0; i < sortedTimeblocks.length; i++) {
          const currTB = sortedTimeblocks[i];

          // Filter out the timeblocks that are within the range
          if (
            dayjs(currTB.date).isBetween(
              dayjs(editingStartDate),
              dayjs(editingEndDate),
              'day',
              '[]'
            ) &&
            dayjs(`${currTB.date} ${currTB.start_time}`).isBetween(
              dayjs(
                `${currTB.date} ${timeToTimetz(dayjs(editingStartDate).format('HH:mm'))}`
              ),
              dayjs(
                `${currTB.date} ${timeToTimetz(dayjs(editingEndDate).add(15, 'minute').format('HH:mm'))}`
              ),
              null,
              '[]'
            ) &&
            dayjs(`${currTB.date} ${currTB.end_time}`).isBetween(
              dayjs(
                `${currTB.date} ${timeToTimetz(dayjs(editingStartDate).format('HH:mm'))}`
              ),
              dayjs(
                `${currTB.date} ${timeToTimetz(dayjs(editingEndDate).add(15, 'minute').format('HH:mm'))}`
              ),
              null,
              '[]'
            )
          ) {
            continue;
          }

          // If currTB includes the range (exclusively), split the timeblock
          // if (
          //   dayjs(currTB.date).isBetween(
          //     dayjs(editingStartDate),
          //     dayjs(editingEndDate),
          //     'day',
          //     '[]'
          //   ) &&
          //   !dayjs(`${currTB.date} ${currTB.start_time}`).isBetween(
          //     dayjs(
          //       `${currTB.date} ${timeToTimetz(dayjs(editingStartDate).format('HH:mm'))}`
          //     ),
          //     dayjs(
          //       `${currTB.date} ${timeToTimetz(dayjs(editingEndDate).add(15, 'minute').format('HH:mm'))}`
          //     ),
          //     null
          //   ) &&
          //   !dayjs(`${currTB.date} ${currTB.end_time}`).isBetween(
          //     dayjs(
          //       `${currTB.date} ${timeToTimetz(dayjs(editingStartDate).format('HH:mm'))}`
          //     ),
          //     dayjs(
          //       `${currTB.date} ${timeToTimetz(dayjs(editingEndDate).add(15, 'minute').format('HH:mm'))}`
          //     ),
          //     null
          //   )
          // ) {
          //   const beforeRange = {
          //     date: currTB.date,
          //     start_time: currTB.start_time,
          //     end_time: timeToTimetz(dayjs(editingStartDate).format('HH:mm')),
          //   };

          //   const afterRange = {
          //     date: currTB.date,
          //     start_time: timeToTimetz(
          //       dayjs(editingEndDate).add(15, 'minute').format('HH:mm')
          //     ),
          //     end_time: currTB.end_time,
          //   };

          //   nextTBs.push(beforeRange);
          //   nextTBs.push(afterRange);
          //   continue;
          // }

          // If currTB's start time is less than or equal to the range's start time,
          // set currTB's end time to the range's start time
          // if (
          //   dayjs(currTB.date).isBetween(
          //     dayjs(editingStartDate),
          //     dayjs(editingEndDate),
          //     'day',
          //     '[]'
          //   ) &&
          //   dayjs(`${currTB.date} ${currTB.start_time}`).isBefore(
          //     dayjs(
          //       `${currTB.date} ${timeToTimetz(dayjs(editingStartDate).format('HH:mm'))}`
          //     )
          //   )
          // ) {
          //   currTB.end_time = minTimetz(
          //     timeToTimetz(dayjs(editingStartDate).format('HH:mm')),
          //     currTB.end_time
          //   );
          // }

          // If currTB's end time is greater than or equal to the range's end time,
          // set currTB's start time to the range's end time
          // if (
          //   dayjs(currTB.date).isBetween(
          //     dayjs(editingStartDate),
          //     dayjs(editingEndDate),
          //     'day',
          //     '[]'
          //   ) &&
          //   dayjs(`${currTB.date} ${currTB.end_time}`).isAfter(
          //     dayjs(
          //       `${currTB.date} ${timeToTimetz(dayjs(editingEndDate).add(15, 'minute').format('HH:mm'))}`
          //     )
          //   )
          // ) {
          //   currTB.start_time = maxTimetz(
          //     timeToTimetz(
          //       dayjs(editingEndDate).add(15, 'minute').format('HH:mm')
          //     ),
          //     currTB.start_time
          //   );
          // }

          nextTBs.push(currTB);
        }

        const filteredTBs = nextTBs.filter((tb) => {
          return tb.start_time !== tb.end_time;
        });

        console.log('[REMOVE] timeblocks', filteredTBs);
        return filteredTBs;
      }

      return prevTimeblocks;
    });

    setEditing({
      enabled: false,
    });
  };

  useEffect(() => {
    const syncTimeBlock = async (timeblock: {
      date: string;
      start_time: string;
      end_time: string;
    }) => {
      await fetch(`/api/meet-together/plans/${plan.id}/timeblocks`, {
        method: 'POST',
        body: JSON.stringify(timeblock),
      });
    };

    const fetchCurrentTimeBlocks = async () => {
      if (!user) return [];

      const supabase = createClientComponentClient();
      const type = user?.is_guest ? 'guest' : 'user';

      const { data, error } = await supabase
        .from(`meet_together_${type}_timeblocks`)
        .select('*')
        .eq('plan_id', plan.id)
        .eq('user_id', user?.id);
      if (error) {
        console.error('Error fetching timeblocks', error);
        return;
      }
      console.log('Fetched timeblocks', data);
    };

    const syncTimeBlocks = async () => {
      const serverTimeblocks = await fetchCurrentTimeBlocks();
      console.log('Server timeblocks', serverTimeblocks);

      // For each time block, asynchonously send the time block to the server
      selectedTimeBlocks.forEach(async (timeblock) => {
        console.log('Sending time block', timeblock);
        await syncTimeBlock(timeblock);
      });
    };

    if (editing) return;
    syncTimeBlocks();
  }, [plan.id, user, selectedTimeBlocks, editing]);

  return (
    <TimeBlockContext.Provider
      value={{
        user,
        selectedTimeBlocks,
        editing,
        showLogin,
        showAccountSwitcher,
        setUser,
        setSelectedTimeBlocks,
        edit,
        endEditing,
        setShowLogin,
        setShowAccountSwitcher,
      }}
    >
      {children}
    </TimeBlockContext.Provider>
  );
};

const useTimeBlocking = () => {
  const context = useContext(TimeBlockContext);

  if (context === undefined)
    throw new Error(
      'useTimeBlocking() must be used within a TimeBlockingProvider.'
    );

  return context;
};

export { TimeBlockingProvider, useTimeBlocking };
