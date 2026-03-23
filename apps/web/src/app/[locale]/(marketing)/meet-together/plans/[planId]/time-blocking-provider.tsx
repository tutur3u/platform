'use client';

import type { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@ncthub/types/primitives/Timeblock';
import type { User as PlatformUser } from '@ncthub/types/primitives/User';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import minMax from 'dayjs/plugin/minMax';
import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  type Touch,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  addTimeblocks,
  durationToTimeblocks,
  removeTimeblocks,
} from '@/utils/timeblock-helper';

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
  originalPlatformUser: null as PlatformUser | null,
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
  isDirty: false,
  isSaving: false,

  getPreviewUsers: (_: Timeblock[]) =>
    ({ available: [], unavailable: [] }) as {
      available: (PlatformUser | GuestUser)[];
      unavailable: (PlatformUser | GuestUser)[];
    },
  getOpacityForDate: (_: Date, __: Timeblock[]) => 0 as number,
  handleSave: async () => {},

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
  const router = useRouter();
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

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initialTimeBlocksRef = useRef<Timeblock[]>([]);

  const setUser = useCallback(
    (planId: string, user: PlatformUser | GuestUser | null) => {
      const nextTimeblocks = timeblocks.filter(
        (tb) =>
          tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
      );

      initialTimeBlocksRef.current = nextTimeblocks;
      setIsDirty(false);
      setSelectedTimeBlocks({
        planId,
        data: nextTimeblocks,
      });
      setInternalUser(user);
    },
    [timeblocks]
  );

  const [displayMode, setDisplayMode] = useState<
    'login' | 'account-switcher'
  >();

  useEffect(() => {
    const nextInitialTimeblocks = timeblocks.filter(
      (tb) =>
        tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
    );

    initialTimeBlocksRef.current = nextInitialTimeblocks;
    setSelectedTimeBlocks({
      planId: plan.id,
      data: nextInitialTimeblocks,
    });
    setIsDirty(false);
  }, [plan.id, timeblocks, user?.id, user?.is_guest]);

  useEffect(() => {
    const initialTimeblocks = initialTimeBlocksRef.current;

    const currentSignature = [...selectedTimeBlocks.data]
      .map((tb) => `${tb.date}-${tb.start_time}-${tb.end_time}`)
      .sort()
      .join('|');

    const initialSignature = [...initialTimeblocks]
      .map((tb) => `${tb.date}-${tb.start_time}-${tb.end_time}`)
      .sort()
      .join('|');

    setIsDirty(currentSignature !== initialSignature);
  }, [selectedTimeBlocks.data]);

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

  const fetchCurrentTimeBlocks = useCallback(
    async (planId: string) => {
      const res = await fetch(`/api/meet-together/plans/${planId}/timeblocks`);
      if (!res.ok) return [];

      const nextTimeblocks = (await res.json()) as Timeblock[];
      return nextTimeblocks
        .flat()
        .filter(
          (tb: Timeblock) =>
            tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
        );
    },
    [user?.id, user?.is_guest]
  );

  const syncTimeBlocks = useCallback(async () => {
    if (!plan.id || !user?.id) return;

    const addTimeBlock = async (timeblock: Timeblock) => {
      if (plan.id !== selectedTimeBlocks.planId) return;

      const data = {
        user_id: user.id,
        password_hash: user.password_hash,
        timeblock,
      };

      await fetch(`/api/meet-together/plans/${plan.id}/timeblocks`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    };

    const removeTimeBlock = async (timeblock: Timeblock) => {
      if (plan.id !== selectedTimeBlocks.planId || !timeblock.id) return;

      const data = {
        user_id: user.id,
        password_hash: user.password_hash,
      };

      await fetch(
        `/api/meet-together/plans/${plan.id}/timeblocks/${timeblock.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify(data),
        }
      );
    };

    const serverTimeblocks = await fetchCurrentTimeBlocks(plan.id);
    const localTimeblocks = selectedTimeBlocks.data;

    const timeblocksToRemove = serverTimeblocks.filter(
      (serverTimeblock) =>
        !localTimeblocks.some(
          (localTimeblock) =>
            localTimeblock.date === serverTimeblock.date &&
            localTimeblock.start_time === serverTimeblock.start_time &&
            localTimeblock.end_time === serverTimeblock.end_time
        )
    );

    const timeblocksToAdd = localTimeblocks.filter(
      (localTimeblock) =>
        !serverTimeblocks.some(
          (serverTimeblock) =>
            serverTimeblock.date === localTimeblock.date &&
            serverTimeblock.start_time === localTimeblock.start_time &&
            serverTimeblock.end_time === localTimeblock.end_time
        )
    );

    if (timeblocksToRemove.length > 0) {
      await Promise.all(
        timeblocksToRemove.map((timeblock) =>
          timeblock.id ? removeTimeBlock(timeblock) : null
        )
      );
    }

    if (timeblocksToAdd.length > 0) {
      await Promise.all(
        timeblocksToAdd.map((timeblock) => addTimeBlock(timeblock))
      );
    }

    const syncedServerTimeblocks = await fetchCurrentTimeBlocks(plan.id);
    initialTimeBlocksRef.current = syncedServerTimeblocks;
    setSelectedTimeBlocks({
      planId: plan.id,
      data: syncedServerTimeblocks,
    });
    setIsDirty(false);
  }, [fetchCurrentTimeBlocks, plan.id, selectedTimeBlocks, user]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);

    try {
      await syncTimeBlocks();
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }, [router, syncTimeBlocks]);

  return (
    <TimeBlockContext.Provider
      value={{
        user,
        originalPlatformUser: platformUser,
        planUsers,
        filteredUserIds,
        previewDate,
        selectedTimeBlocks,
        editing,
        displayMode,
        isDirty,
        isSaving,

        getPreviewUsers,
        getOpacityForDate,
        handleSave,

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
