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
import {
  addTimeblocks,
  durationToTimeblocks,
  removeTimeblocks,
} from '@/utils/timeblock-helper';

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

  const endEditing = () => {
    if (editing.startDate === undefined || editing.endDate === undefined)
      return;

    setSelectedTimeBlocks((prevTimeblocks) => {
      const dates = [editing.startDate, dayjs(editing.endDate).toDate()].filter(
        Boolean
      ) as Date[];

      if (editing.mode === 'add') {
        const extraTimeblocks = durationToTimeblocks(dates);
        const timeblocks = addTimeblocks(prevTimeblocks, extraTimeblocks);
        return timeblocks;
      }

      if (editing.mode === 'remove') {
        const timeblocks = removeTimeblocks(prevTimeblocks, dates);
        return timeblocks;
      }

      return prevTimeblocks;
    });

    setEditing({
      enabled: false,
    });
  };

  useEffect(() => {
    const addTimeBlock = async (timeblock: {
      date: string;
      start_time: string;
      end_time: string;
    }) => {
      await fetch(`/api/meet-together/plans/${plan.id}/timeblocks`, {
        method: 'POST',
        body: JSON.stringify(timeblock),
      });
    };

    const removeTimeBlock = async (id: string) => {
      await fetch(`/api/meet-together/plans/${plan.id}/timeblocks/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
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

      if (error) return [];
      return data;
    };

    const syncTimeBlocks = async () => {
      const serverTimeblocks = await fetchCurrentTimeBlocks();
      console.log('Server timeblocks', serverTimeblocks);

      // For each time block, remove timeblocks that are not on local
      // and add timeblocks that are not on server
      const localTimeblocks = selectedTimeBlocks;
      console.log('Local timeblocks', localTimeblocks);

      const timeblocksToRemove = serverTimeblocks?.filter(
        (serverTimeblock: Timeblock) =>
          !localTimeblocks.some(
            (localTimeblock: Timeblock) =>
              localTimeblock.date === serverTimeblock.date &&
              localTimeblock.start_time === serverTimeblock.start_time &&
              localTimeblock.end_time === serverTimeblock.end_time
          )
      );

      const timeblocksToAdd = localTimeblocks?.filter(
        (localTimeblock: Timeblock) =>
          !serverTimeblocks?.some(
            (serverTimeblock: Timeblock) =>
              serverTimeblock.date === localTimeblock.date &&
              serverTimeblock.start_time === localTimeblock.start_time &&
              serverTimeblock.end_time === localTimeblock.end_time
          )
      );

      await Promise.all(
        timeblocksToRemove?.map((timeblock) => removeTimeBlock(timeblock.id))
      );

      await Promise.all(
        timeblocksToAdd.map((timeblock) => addTimeBlock(timeblock))
      );
    };

    if (editing.enabled) return;
    syncTimeBlocks();
  }, [plan.id, user, selectedTimeBlocks, editing.enabled]);

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
