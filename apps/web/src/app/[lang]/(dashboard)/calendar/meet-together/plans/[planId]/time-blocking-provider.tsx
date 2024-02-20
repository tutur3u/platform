'use client';

import {
  ReactNode,
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
  edit: (_: { mode: 'add' | 'remove'; date: Date }) => {},
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

  const edit = ({ mode, date }: { mode: 'add' | 'remove'; date: Date }) => {
    setEditing((prevData) => {
      return {
        enabled: true,
        mode: prevData?.mode === undefined ? mode : prevData.mode,
        startDate:
          prevData?.startDate === undefined ? date : prevData.startDate,
        endDate: date,
      };
    });
  };

  // const convertDurationToTimeblocks = (
  //   start?: Date,
  //   end?: Date
  // ): Timeblock[] => {
  //   if (!start || !end) return [];

  //   const timeblocks = [];

  //   const date = start.toISOString().split('T')[0];
  //   const startTime = start.toISOString().split('T')[1].split('.')[0];
  //   const endTime = end.toISOString().split('T')[1].split('.')[0];

  //   timeblocks.push({
  //     date,
  //     start_time: startTime,
  //     end_time: endTime,
  //   });

  //   return timeblocks;
  // };

  const endEditing = () => {
    if (editing.startDate === undefined || editing.endDate === undefined)
      return;

    // const extraTimeblocks = convertDurationToTimeblocks(
    //   editing.startDate,
    //   editing.endDate
    // );

    // console.log('Extra timeblocks', extraTimeblocks);

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
