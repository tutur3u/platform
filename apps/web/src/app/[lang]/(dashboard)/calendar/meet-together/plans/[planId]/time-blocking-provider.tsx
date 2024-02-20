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

    const extraTimeblocks = convertDurationToTimeblocks(
      editing.startDate,
      editing.endDate
    );

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

        // Merge overlapping, consecutive, and matching end/start timeblocks
        const mergedTimeblocks: Timeblock[] = [];
        let currentBlock: Timeblock | undefined;

        for (const tb of sortedTimeblocks) {
          const tbStartTime = dayjs(`${tb.date} ${tb.start_time}`);
          const tbEndTime = dayjs(`${tb.date} ${tb.end_time}`);

          // Handle potential undefined currentBlock
          if (!currentBlock) {
            currentBlock = tb;
            continue; // Skip further checks when starting a new block
          }

          // Revised merging logic:

          // Check for subset block before merging
          if (
            tb.start_time > currentBlock.start_time &&
            tb.end_time < currentBlock.end_time
          ) {
            continue; // Skip merging subset block
          }

          // Check for merging based on matching end and start times
          if (tb.end_time == currentBlock.start_time) {
            currentBlock.end_time = tb.end_time;
          } else if (
            // Check for overlap or consecutive timeblocks based on matching end/start
            tbStartTime.isBefore(currentBlock.end_time) ||
            (tb.end_time == currentBlock.start_time &&
              tb.date === currentBlock.date)
          ) {
            // Merge overlapping or consecutive timeblocks
            currentBlock.end_time = timeToTimetz(
              dayjs
                .max(dayjs(currentBlock.end_time), tbEndTime)
                ?.format('HH:mm') || ''
            );
          } else {
            // Add the previous block to the merged list and start a new one
            mergedTimeblocks.push(currentBlock);
            currentBlock = tb;
          }
        }

        // Add the last block if it exists
        if (currentBlock) {
          mergedTimeblocks.push(currentBlock);
        }

        console.log('Merged timeblocks', mergedTimeblocks);
        return mergedTimeblocks;
      }

      // Return existing timeblocks for other modes
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
