'use client';

import {
  addTimeblocks,
  durationToTimeblocks,
  removeTimeblocks,
} from '@/utils/timeblock-helper';
import { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import { Timeblock } from '@ncthub/types/primitives/Timeblock';
import { User as PlatformUser } from '@ncthub/types/primitives/User';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import minMax from 'dayjs/plugin/minMax';
import {
  ReactNode,
  Touch,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

dayjs.extend(isBetween);
dayjs.extend(minMax);

interface GuestUser {
  id?: string | null;
  display_name?: string | null;
  password_hash?: string;
  is_guest?: boolean | null;
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
  planUsers: [] as (PlatformUser | GuestUser)[],
  filteredUserIds: [] as string[],
  previewDate: null as Date | null,
  selectedTimeBlocks: {
    data: [] as Timeblock[],
  } as { planId?: string; data: Timeblock[] },
  editing: {
    enabled: false,
  } as EditingParams,
  displayMode: 'account-switcher' as 'login' | 'account-switcher' | undefined,

  getPreviewUsers: (_: Timeblock[]) =>
    ({ available: [], unavailable: [] }) as {
      available: (PlatformUser | GuestUser)[];
      unavailable: (PlatformUser | GuestUser)[];
    },
  getOpacityForDate: (_: Date, __: Timeblock[]) => 0 as number,

  setUser: (_: string, __: PlatformUser | GuestUser | null) => {},
  setFilteredUserIds: (_: string[] | ((prev: string[]) => string[])) => {},
  setPreviewDate: (_: Date | null) => {},
  setSelectedTimeBlocks: (_: { planId?: string; data: Timeblock[] }) => {},
  edit: (_: { mode: 'add' | 'remove'; date: Date }, __?: any) => {},
  endEditing: () => {},
  setDisplayMode: (
    _?:
      | 'login'
      | 'account-switcher'
      | ((
          prev: 'login' | 'account-switcher' | undefined
        ) => 'login' | 'account-switcher' | undefined)
  ) => {},
});

const TimeBlockingProvider = ({
  platformUser,
  plan,
  users,
  timeblocks,
  children,
}: {
  platformUser: PlatformUser | null;
  plan: MeetTogetherPlan;
  users: (PlatformUser | GuestUser)[];
  timeblocks: Timeblock[];
  children: ReactNode;
}) => {
  const [planUsers, setInternalUsers] = useState(users);
  const [filteredUserIds, setFilteredUserIds] = useState<string[]>([]);

  useEffect(() => {
    setInternalUsers(users);
  }, [users]);

  const [previewDate, setPreviewDate] = useState<Date | null>(null);

  const getPreviewUsers = useCallback(
    (timeblocks: Timeblock[]) => {
      if (!previewDate) return { available: [], unavailable: [] };

      const previewUserIds = timeblocks
        .filter((timeblock) => {
          const start = dayjs(`${timeblock.date} ${timeblock.start_time}`);
          const end = dayjs(`${timeblock.date} ${timeblock.end_time}`);
          return dayjs(previewDate).isBetween(start, end, null, '[)');
        })
        .map((timeblock) => timeblock.user_id)
        .filter(Boolean) as string[];

      const allUsers = planUsers.filter(
        (user) =>
          filteredUserIds.length === 0 ||
          !user?.id ||
          filteredUserIds.includes(user.id)
      );

      const uniqueUserIds = Array.from(new Set(previewUserIds));

      return {
        available: allUsers.filter(
          (user) => !user?.id || uniqueUserIds.includes(user.id)
        ),
        unavailable: allUsers.filter(
          (user) => user.id && !uniqueUserIds.includes(user.id)
        ),
      };
    },
    [previewDate, planUsers, filteredUserIds]
  );

  const getOpacityForDate = useCallback(
    (date: Date, timeblocks: Timeblock[]) => {
      const allTimeblocks = timeblocks
        .filter((timeblock) => {
          const start = dayjs(`${timeblock.date} ${timeblock.start_time}`);
          const end = dayjs(`${timeblock.date} ${timeblock.end_time}`);
          return dayjs(date).isBetween(start, end, null, '[)');
        })
        .map((timeblock) => timeblock.user_id)
        .filter(Boolean) as string[];

      const uniqueUserIds = Array.from(new Set(allTimeblocks));

      return (
        uniqueUserIds.length /
        (filteredUserIds.length > 0 ? filteredUserIds.length : planUsers.length)
      );
    },
    [filteredUserIds.length, planUsers.length]
  );

  const [editing, setEditing] = useState<EditingParams>({
    enabled: false,
  });

  const [user, setInternalUser] = useState<PlatformUser | GuestUser | null>(
    platformUser
  );

  useEffect(() => {
    setInternalUser(platformUser);
  }, [platformUser]);

  const [selectedTimeBlocks, setSelectedTimeBlocks] = useState<{
    planId?: string;
    data: Timeblock[];
  }>({
    planId: plan.id,
    data: timeblocks.filter((tb) => tb.user_id === user?.id),
  });

  const setUser = (planId: string, user: PlatformUser | GuestUser | null) => {
    setSelectedTimeBlocks({
      planId,
      data: timeblocks.filter(
        (tb) =>
          tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
      ),
    });
    setInternalUser(user);
  };

  const [displayMode, setDisplayMode] = useState<
    'login' | 'account-switcher'
  >();

  const edit = useCallback(
    ({ mode, date }: { mode: 'add' | 'remove'; date: Date }, event?: any) => {
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
    },
    []
  );

  const endEditing = useCallback(() => {
    if (
      !plan.id ||
      editing.startDate === undefined ||
      editing.endDate === undefined
    )
      return;

    setSelectedTimeBlocks((prevTimeblocks) => {
      const dates = [editing.startDate, dayjs(editing.endDate).toDate()].filter(
        Boolean
      ) as Date[];

      if (editing.mode === 'add') {
        const extraTimeblocks = durationToTimeblocks(dates);
        const timeblocks = addTimeblocks(prevTimeblocks.data, extraTimeblocks);
        return {
          planId: plan.id,
          data: timeblocks.map((tb) => ({ ...tb, plan_id: plan.id })),
        };
      }

      if (editing.mode === 'remove') {
        const timeblocks = removeTimeblocks(prevTimeblocks.data, dates);
        return {
          planId: plan.id,
          data: timeblocks.map((tb) => ({ ...tb, plan_id: plan.id })),
        };
      }

      return prevTimeblocks;
    });

    setEditing({
      enabled: false,
    });
  }, [plan.id, editing]);

  useEffect(() => {
    const addTimeBlock = async (timeblock: Timeblock) => {
      if (plan.id !== selectedTimeBlocks.planId) return;

      const data = {
        user_id: user?.id,
        password_hash: user?.password_hash,
        timeblock,
      };

      await fetch(`/api/meet-together/plans/${plan.id}/timeblocks`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    };

    const removeTimeBlock = async (timeblock: Timeblock) => {
      if (plan.id !== selectedTimeBlocks.planId) return;

      const data = {
        user_id: user?.id,
        password_hash: user?.password_hash,
      };

      await fetch(
        `/api/meet-together/plans/${plan.id}/timeblocks/${timeblock.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify(data),
        }
      );
    };

    const fetchCurrentTimeBlocks = async (planId: string) => {
      const res = await fetch(`/api/meet-together/plans/${planId}/timeblocks`);
      if (!res.ok) return [];

      const timeblocks = (await res.json()) as Timeblock[];
      return timeblocks
        ?.flat()
        .filter(
          (tb: Timeblock) =>
            tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
        );
    };

    const syncTimeBlocks = async () => {
      if (!plan.id || !user?.id) return;

      const serverTimeblocks = await fetchCurrentTimeBlocks(plan?.id);
      const localTimeblocks = selectedTimeBlocks.data;

      if (!serverTimeblocks || !localTimeblocks) return;
      if (serverTimeblocks.length === 0 && localTimeblocks.length === 0) return;

      // If server timeblocks are empty and local timeblocks are not,
      // add all local timeblocks to server
      if (serverTimeblocks.length === 0 && localTimeblocks.length > 0) {
        await Promise.all(
          localTimeblocks.map((timeblock) => addTimeBlock(timeblock))
        );
        return;
      }

      // If local timeblocks are empty, remove all server timeblocks
      if (serverTimeblocks.length > 0 && localTimeblocks.length === 0) {
        await Promise.all(
          serverTimeblocks.map((timeblock) => removeTimeBlock(timeblock))
        );
        return;
      }

      // If there are no timeblocks to sync (both local and server have
      // the same timeblocks), return early
      if (
        serverTimeblocks.every((serverTimeblock: Timeblock) =>
          localTimeblocks.some(
            (localTimeblock: Timeblock) =>
              localTimeblock.date === serverTimeblock.date &&
              localTimeblock.start_time === serverTimeblock.start_time &&
              localTimeblock.end_time === serverTimeblock.end_time
          )
        ) &&
        localTimeblocks.every((localTimeblock: Timeblock) =>
          serverTimeblocks.some(
            (serverTimeblock: Timeblock) =>
              serverTimeblock.date === localTimeblock.date &&
              serverTimeblock.start_time === localTimeblock.start_time &&
              serverTimeblock.end_time === localTimeblock.end_time
          )
        ) &&
        serverTimeblocks.length === localTimeblocks.length
      )
        return;

      // For each time block, remove timeblocks that are not on local
      // and add timeblocks that are not on server
      const timeblocksToRemove = serverTimeblocks.filter(
        (serverTimeblock: Timeblock) =>
          !localTimeblocks.some(
            (localTimeblock: Timeblock) =>
              localTimeblock.date === serverTimeblock.date &&
              localTimeblock.start_time === serverTimeblock.start_time &&
              localTimeblock.end_time === serverTimeblock.end_time
          )
      );

      const timeblocksToAdd = localTimeblocks.filter(
        (localTimeblock: Timeblock) =>
          !serverTimeblocks?.some(
            (serverTimeblock: Timeblock) =>
              serverTimeblock.date === localTimeblock.date &&
              serverTimeblock.start_time === localTimeblock.start_time &&
              serverTimeblock.end_time === localTimeblock.end_time
          )
      );

      if (timeblocksToRemove.length === 0 && timeblocksToAdd.length === 0)
        return;

      if (timeblocksToRemove.length > 0)
        await Promise.all(
          timeblocksToRemove.map((timeblock) =>
            timeblock.id ? removeTimeBlock(timeblock) : null
          )
        );

      if (timeblocksToAdd.length > 0)
        await Promise.all(
          timeblocksToAdd.map((timeblock) => addTimeBlock(timeblock))
        );

      const syncedServerTimeblocks = await fetchCurrentTimeBlocks(plan?.id);
      setSelectedTimeBlocks({
        planId: plan.id,
        data: syncedServerTimeblocks,
      });
    };

    if (editing.enabled) return;
    syncTimeBlocks();
  }, [plan.id, user, selectedTimeBlocks, editing.enabled]);

  return (
    <TimeBlockContext.Provider
      value={{
        user,
        planUsers,
        filteredUserIds,
        previewDate,
        selectedTimeBlocks,
        editing,
        displayMode,

        getPreviewUsers,
        getOpacityForDate,

        setUser,
        setFilteredUserIds,
        setPreviewDate,
        setSelectedTimeBlocks,
        edit,
        endEditing,
        setDisplayMode,
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
