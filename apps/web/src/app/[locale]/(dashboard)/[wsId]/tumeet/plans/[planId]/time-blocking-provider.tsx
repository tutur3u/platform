'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import type { User as PlatformUser } from '@tuturuuu/types/primitives/User';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import minMax from 'dayjs/plugin/minMax';
import {
  createContext,
  type ReactNode,
  type Touch,
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

// Helper functions
function addTimeblocks(timeblocks: Timeblock[], newTimeblocks: Timeblock[]) {
  return [...timeblocks, ...newTimeblocks];
}

function removeTimeblocks(
  timeblocks: Timeblock[],
  blocksToRemove: Timeblock[]
) {
  return timeblocks.filter(
    (block) =>
      !blocksToRemove.some(
        (removeBlock) =>
          block.date === removeBlock.date &&
          block.start_time === removeBlock.start_time &&
          block.end_time === removeBlock.end_time
      )
  );
}

function durationToTimeblocks(startDate: Date, endDate: Date): Timeblock[] {
  const blocks: Timeblock[] = [];
  const start = dayjs(startDate);
  const end = dayjs(endDate);

  let current = start;
  while (current.isBefore(end) || current.isSame(end, 'minute')) {
    const blockEnd = current.add(15, 'minute');
    blocks.push({
      date: current.format('YYYY-MM-DD'),
      start_time: current.format('HH:mm:ss'),
      end_time: blockEnd.format('HH:mm:ss'),
      user_id: null,
      plan_id: null,
    });
    current = blockEnd;
  }

  return blocks;
}

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
        const newTimeblocks = durationToTimeblocks(
          dayjs.min(dates.map((d) => dayjs(d)))!.toDate(),
          dayjs.max(dates.map((d) => dayjs(d)))!.toDate()
        );

        return {
          ...prevTimeblocks,
          data: addTimeblocks(prevTimeblocks.data, newTimeblocks),
        };
      } else {
        const blocksToRemove = durationToTimeblocks(
          dayjs.min(dates.map((d) => dayjs(d)))!.toDate(),
          dayjs.max(dates.map((d) => dayjs(d)))!.toDate()
        );

        return {
          ...prevTimeblocks,
          data: removeTimeblocks(prevTimeblocks.data, blocksToRemove),
        };
      }
    });

    setEditing({ enabled: false });
  }, [plan.id, editing.startDate, editing.endDate, editing.mode]);

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
  if (!context) {
    throw new Error(
      'useTimeBlocking must be used within a TimeBlockingProvider'
    );
  }
  return context;
};

export { TimeBlockingProvider, useTimeBlocking };
