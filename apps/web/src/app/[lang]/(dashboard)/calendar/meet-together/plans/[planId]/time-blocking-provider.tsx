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
import { User as PlatformUser } from '@/types/primitives/User';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Timeblock } from '@/types/primitives/Timeblock';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';

dayjs.extend(isBetween);

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

    let currentDate = new Date(startDate.getTime());

    while (currentDate <= endDate) {
      const date = currentDate.toISOString().split('T')[0];
      const startTime = currentDate.toISOString().split('T')[1].split('.')[0];
      // Assuming the end time is the end of the day
      const endTime = '23:59:59';

      timeblocks.push({
        date,
        start_time: startTime,
        end_time: endTime,
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

    console.log('Extra timeblocks', extraTimeblocks);

    console.log('Ending editing', editing);

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
