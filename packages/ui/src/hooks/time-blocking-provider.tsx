'use client';

import {
  createTimeblocks,
  deleteTimeblock,
  getTimeblocks,
} from '@tuturuuu/apis/tumeet/actions';
import type {
  GuestUser,
  MeetTogetherPlan,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import type { User as PlatformUser } from '@tuturuuu/types/primitives/User';
import {
  addTimeblocks,
  removeTimeblocks,
} from '@tuturuuu/utils/timeblock-helper';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import minMax from 'dayjs/plugin/minMax';
import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

dayjs.extend(isBetween);
dayjs.extend(minMax);

interface EditingParams {
  enabled: boolean;
  mode?: 'add' | 'remove';
  initialTouch?: { x: number; y: number };
  startDate?: Date;
  endDate?: Date;
  tentativeMode?: boolean;
}

// Utility function to compare timeblock arrays
const areTimeBlockArraysEqual = (arr1: Timeblock[], arr2: Timeblock[]) => {
  if (arr1.length !== arr2.length) return false;

  return arr1.every((tb1) =>
    arr2.some(
      (tb2) =>
        tb1.date === tb2.date &&
        tb1.start_time === tb2.start_time &&
        tb1.end_time === tb2.end_time
    )
  );
};

// Utility function to find timeblocks that exist in arr1 but not in arr2
const findTimeBlocksToRemove = (
  serverTimeblocks: Timeblock[],
  localTimeblocks: Timeblock[]
) => {
  return serverTimeblocks.filter(
    (serverTimeblock: Timeblock) =>
      !localTimeblocks.some(
        (localTimeblock: Timeblock) =>
          localTimeblock.date === serverTimeblock.date &&
          localTimeblock.start_time === serverTimeblock.start_time &&
          localTimeblock.end_time === serverTimeblock.end_time
      )
  );
};

// Utility function to find timeblocks that exist in arr2 but not in arr1
const findTimeBlocksToAdd = (
  localTimeblocks: Timeblock[],
  serverTimeblocks: Timeblock[]
) => {
  return localTimeblocks.filter(
    (localTimeblock: Timeblock) =>
      !serverTimeblocks?.some(
        (serverTimeblock: Timeblock) =>
          serverTimeblock.date === localTimeblock.date &&
          serverTimeblock.start_time === localTimeblock.start_time &&
          serverTimeblock.end_time === localTimeblock.end_time
      )
  );
};

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
  handleSave: () => {},

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getPreviewUsers: (_: Timeblock[]) =>
    ({ available: [], tentative: [], unavailable: [] }) as {
      available: (PlatformUser | GuestUser)[];
      tentative: (PlatformUser | GuestUser)[];
      unavailable: (PlatformUser | GuestUser)[];
    },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getOpacityForDate: (_: Date, __: Timeblock[]) => 0 as number | string,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setUser: (_: string, __: PlatformUser | GuestUser | null) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setFilteredUserIds: (_: string[] | ((prev: string[]) => string[])) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setPreviewDate: (_: Date | null) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSelectedTimeBlocks: (_: { planId?: string; data: Timeblock[] }) => {},
  edit: (
    _: { mode: 'add' | 'remove'; date: Date; tentativeMode?: boolean },
    __?: TouchEvent | MouseEvent
  ) => {},
  endEditing: () => {},
  setDisplayMode: (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _?:
      | 'login'
      | 'account-switcher'
      | ((
          prev: 'login' | 'account-switcher' | undefined
        ) => 'login' | 'account-switcher' | undefined)
  ) => {},
  syncTimeBlocks: () => Promise.resolve(),
  resetLocalTimeblocks: () => Promise.resolve(),
  markAsDirty: () => {},
  clearDirtyState: () => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clearDirtyStateWithTimeblocks: (_: Timeblock[]) => {},
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

  const setFilteredUserIdsCallback = useCallback(
    (userIds: string[] | ((prev: string[]) => string[])) => {
      setFilteredUserIds(userIds);
    },
    []
  );

  useEffect(() => {
    setInternalUsers(users);
  }, [users]);

  const [previewDate, setPreviewDate] = useState<Date | null>(null);

  const setPreviewDateCallback = useCallback((date: Date | null) => {
    setPreviewDate(date);
  }, []);

  const setSelectedTimeBlocksCallback = useCallback(
    (timeblocks: { planId?: string; data: Timeblock[] }) => {
      setSelectedTimeBlocks(timeblocks);
    },
    []
  );

  const getPreviewUsers = useCallback(
    (timeblocks: Timeblock[]) => {
      if (!previewDate)
        return { available: [], tentative: [], unavailable: [] };

      // Get users with confirmed timeblocks
      const confirmedUserIds = timeblocks
        .filter((timeblock) => {
          const start = dayjs(`${timeblock.date} ${timeblock.start_time}`);
          const end = dayjs(`${timeblock.date} ${timeblock.end_time}`);
          return (
            dayjs(previewDate).isBetween(start, end, null, '[)') &&
            !timeblock.tentative
          );
        })
        .map((timeblock) => timeblock.user_id)
        .filter(Boolean) as string[];

      // Get users with tentative timeblocks
      const tentativeUserIds = timeblocks
        .filter((timeblock) => {
          const start = dayjs(`${timeblock.date} ${timeblock.start_time}`);
          const end = dayjs(`${timeblock.date} ${timeblock.end_time}`);
          return (
            dayjs(previewDate).isBetween(start, end, null, '[)') &&
            timeblock.tentative
          );
        })
        .map((timeblock) => timeblock.user_id)
        .filter(Boolean) as string[];

      const allUsers = planUsers.filter(
        (user) =>
          filteredUserIds.length === 0 ||
          !user?.id ||
          filteredUserIds.includes(user.id)
      );

      const uniqueConfirmedUserIds = Array.from(new Set(confirmedUserIds));
      const uniqueTentativeUserIds = Array.from(new Set(tentativeUserIds));

      return {
        available: allUsers.filter(
          (user) => !user?.id || uniqueConfirmedUserIds.includes(user.id)
        ),
        tentative: allUsers.filter(
          (user) => !user?.id || uniqueTentativeUserIds.includes(user.id)
        ),
        unavailable: allUsers.filter(
          (user) =>
            user.id &&
            !uniqueConfirmedUserIds.includes(user.id) &&
            !uniqueTentativeUserIds.includes(user.id)
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
  }>(() => ({
    planId: plan.id,
    data: timeblocks.filter((tb) => tb.user_id === user?.id),
  }));

  // Add dirty state tracking
  const [isDirty, setIsDirty] = useState(false);
  const initialTimeBlocksRef = useRef<Timeblock[]>([]);

  useEffect(() => {
    setIsDirty(false);
  }, []);

  // Initialize initial timeblocks for comparison
  useEffect(() => {
    initialTimeBlocksRef.current = timeblocks.filter(
      (tb) => tb.user_id === user?.id
    );
  }, [timeblocks, user?.id]);

  // Memoize the dirty state checking function
  const checkDirtyState = useCallback(() => {
    const currentTimeBlocks = selectedTimeBlocks.data;
    const initialTimeBlocks = initialTimeBlocksRef.current;

    const currentSorted = [...currentTimeBlocks].sort((a, b) =>
      `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)
    );
    const initialSorted = [...initialTimeBlocks].sort((a, b) =>
      `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)
    );

    return (
      currentSorted.length !== initialSorted.length ||
      currentSorted.some((current, index) => {
        const initial = initialSorted[index];
        return (
          !initial ||
          current.date !== initial.date ||
          current.start_time !== initial.start_time ||
          current.end_time !== initial.end_time ||
          current.tentative !== initial.tentative
        );
      })
    );
  }, [selectedTimeBlocks.data]);

  // Check if current timeblocks differ from initial state
  useEffect(() => {
    const hasChanges = checkDirtyState();
    setIsDirty(hasChanges);
  }, [checkDirtyState]);

  const markAsDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const clearDirtyState = useCallback(() => {
    setIsDirty(false);
    // Update initial state to current state
    initialTimeBlocksRef.current = [...selectedTimeBlocks.data];
  }, [selectedTimeBlocks.data]);

  // Add a function to clear dirty state with specific timeblocks
  const clearDirtyStateWithTimeblocks = useCallback(
    (timeblocks: Timeblock[]) => {
      setIsDirty(false);
      // Update initial state to the provided timeblocks
      initialTimeBlocksRef.current = [...timeblocks];
    },
    []
  );

  const setUser = useCallback(
    (planId: string, user: PlatformUser | GuestUser | null) => {
      setSelectedTimeBlocks({
        planId,
        data: timeblocks.filter(
          (tb) =>
            tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
        ),
      });
      setInternalUser(user);
    },
    [timeblocks]
  );

  const [displayMode, setDisplayMode] = useState<
    'login' | 'account-switcher'
  >();

  // Add debouncing for endEditing to prevent multiple rapid calls
  const endEditingInProgressRef = useRef(false);
  const endEditingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setDisplayModeCallback = useCallback(
    (
      mode?:
        | 'login'
        | 'account-switcher'
        | ((
            prev: 'login' | 'account-switcher' | undefined
          ) => 'login' | 'account-switcher' | undefined)
    ) => {
      setDisplayMode(mode);
    },
    []
  );

  const edit = useCallback(
    (
      {
        mode,
        date,
        tentativeMode,
      }: { mode: 'add' | 'remove'; date: Date; tentativeMode?: boolean },
      event?: TouchEvent | MouseEvent
    ) => {
      const touch =
        event && 'touches' in event ? event.touches?.[0] : undefined;

      setEditing((prevData) => {
        const nextMode = prevData?.mode ?? mode;
        const nextTentativeMode = prevData?.tentativeMode ?? tentativeMode;
        const nextTouch =
          prevData?.initialTouch ??
          (touch
            ? {
                x: touch.clientX,
                y: touch.clientY,
              }
            : undefined);

        const nextStart = prevData?.startDate ?? date;

        const touchXDiff =
          (touch?.clientX || 0) - (prevData?.initialTouch?.x || 0);

        const touchYDiff =
          (touch?.clientY || 0) - (prevData?.initialTouch?.y || 0);

        const nextEnd =
          prevData?.initialTouch !== undefined && nextTouch
            ? nextStart
              ? // Only apply complex calculation if there's significant movement
                // For taps with minimal movement, use the same date as start
                // Increased thresholds to prevent accidental multi-selection on mobile
                Math.abs(touchXDiff) > 30 || Math.abs(touchYDiff) > 30
                ? dayjs(nextStart)
                    .add(Math.floor((touchYDiff / 15) * 1.25) * 15, 'minute')
                    .add(
                      // Only add days if horizontal movement is significant (more than 80px)
                      // and vertical movement is minimal (less than 40px) to avoid accidental cross-day selection
                      // Also ensure we're actually dragging (not just a tap)
                      Math.abs(touchXDiff) > 80 && Math.abs(touchYDiff) < 40
                        ? Math.floor(touchXDiff / 100)
                        : 0,
                      'day'
                    )
                    .toDate()
                : nextStart // For single taps, end = start
              : nextStart
            : date;

        return {
          enabled: true,
          mode: nextMode,
          startDate: nextStart,
          endDate: nextEnd,
          initialTouch: nextTouch,
          tentativeMode: nextTentativeMode,
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

    // Prevent multiple rapid calls to endEditing
    if (endEditingInProgressRef.current) {
      console.log('endEditing already in progress, skipping');
      return;
    }

    // Clear any pending timeout
    if (endEditingTimeoutRef.current) {
      clearTimeout(endEditingTimeoutRef.current);
      endEditingTimeoutRef.current = null;
    }

    // Debounce the actual processing
    endEditingTimeoutRef.current = setTimeout(() => {
      endEditingInProgressRef.current = true;

      try {
        setSelectedTimeBlocks((prevTimeblocks) => {
          const dates = [
            editing.startDate,
            dayjs(editing.endDate).toDate(),
          ].filter(Boolean) as Date[];

          if (editing.mode === 'add') {
            const timeblocks = addTimeblocks(
              prevTimeblocks.data,
              dates,
              editing.tentativeMode ?? false
            );

            // Deduplicate timeblocks at the source to prevent duplicates
            const deduplicatedTimeblocks = timeblocks.filter(
              (timeblock, index, self) => {
                const key = `${plan.id}-${timeblock.user_id}-${timeblock.date}-${timeblock.start_time}-${timeblock.end_time}-${timeblock.tentative}`;
                return (
                  self.findIndex(
                    (tb: Timeblock) =>
                      `${plan.id}-${tb.user_id}-${tb.date}-${tb.start_time}-${tb.end_time}-${tb.tentative}` ===
                      key
                  ) === index
                );
              }
            );

            return {
              planId: plan.id,
              data: deduplicatedTimeblocks.map((tb) => ({
                ...tb,
                plan_id: plan.id,
              })),
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
      } finally {
        endEditingInProgressRef.current = false;
      }
    }, 100); // Increased delay to better prevent rapid calls
  }, [plan.id, editing]);

  // Cleanup timeout on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (endEditingTimeoutRef.current) {
        clearTimeout(endEditingTimeoutRef.current);
        endEditingTimeoutRef.current = null;
      }
    };
  }, []);

  // Page leave warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && user?.id) {
        e.preventDefault();
        e.returnValue =
          'You have unsaved changes. Are you sure you want to leave?';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, user?.id]);

  const fetchCurrentTimeBlocks = useCallback(
    async (planId: string) => {
      const result = await getTimeblocks(planId);
      if (result.error || !result.data) return [];
      return result.data
        .flat()
        .filter(
          (tb: Timeblock) =>
            tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
        );
    },
    [user?.id, user?.is_guest]
  );

  const resetLocalTimeblocks = useCallback(async () => {
    if (!plan.id || !user?.id) return;
    const serverTimeblocks = await fetchCurrentTimeBlocks(plan.id);
    setSelectedTimeBlocks({
      planId: plan.id,
      data: serverTimeblocks,
    });
    setIsDirty(false);
  }, [fetchCurrentTimeBlocks, plan.id, user?.id]);

  const syncTimeBlocks = useCallback(async () => {
    if (!plan.id || !user?.id) return;

    // Capture values after check to ensure they're not undefined
    const planId = plan.id;
    const userId = user.id;
    const passwordHash = user.password_hash;

    const addTimeBlocksBatch = async (timeblocksToAdd: Timeblock[]) => {
      if (planId !== selectedTimeBlocks.planId || timeblocksToAdd.length === 0)
        return;
      await createTimeblocks(planId, {
        user_id: userId,
        password_hash: passwordHash,
        timeblocks: timeblocksToAdd,
      });
    };

    const removeTimeBlock = async (timeblock: Timeblock) => {
      if (planId !== selectedTimeBlocks.planId || !timeblock.id) return;
      await deleteTimeblock(planId, timeblock.id, {
        user_id: userId,
        password_hash: passwordHash,
      });
    };

    const serverTimeblocks = await fetchCurrentTimeBlocks(plan?.id);
    const localTimeblocks = selectedTimeBlocks.data;
    if (!serverTimeblocks || !localTimeblocks) return;
    if (serverTimeblocks.length === 0 && localTimeblocks.length === 0) {
      // No changes needed, clear dirty state
      clearDirtyStateWithTimeblocks([]);
      return;
    }
    if (serverTimeblocks.length === 0 && localTimeblocks.length > 0) {
      await addTimeBlocksBatch(localTimeblocks);
      const syncedServerTimeblocks = await fetchCurrentTimeBlocks(plan?.id);
      setSelectedTimeBlocks({
        planId: plan.id,
        data: syncedServerTimeblocks,
      });
      clearDirtyStateWithTimeblocks(syncedServerTimeblocks);
      return;
    }
    if (serverTimeblocks.length > 0 && localTimeblocks.length === 0) {
      await Promise.all(
        serverTimeblocks.map((timeblock: Timeblock) =>
          removeTimeBlock(timeblock)
        )
      );
      const syncedServerTimeblocks = await fetchCurrentTimeBlocks(plan?.id);
      setSelectedTimeBlocks({
        planId: plan.id,
        data: syncedServerTimeblocks,
      });
      clearDirtyStateWithTimeblocks(syncedServerTimeblocks);
      return;
    }
    if (areTimeBlockArraysEqual(serverTimeblocks, localTimeblocks)) {
      // No changes needed, clear dirty state
      clearDirtyStateWithTimeblocks(serverTimeblocks);
      return;
    }
    const timeblocksToRemove = findTimeBlocksToRemove(
      serverTimeblocks,
      localTimeblocks
    );
    const timeblocksToAdd = findTimeBlocksToAdd(
      localTimeblocks,
      serverTimeblocks
    );
    if (timeblocksToRemove.length === 0 && timeblocksToAdd.length === 0) {
      // No changes needed, clear dirty state
      clearDirtyStateWithTimeblocks(serverTimeblocks);
      return;
    }
    if (timeblocksToRemove.length > 0)
      await Promise.all(
        timeblocksToRemove.map((timeblock) =>
          timeblock.id ? removeTimeBlock(timeblock) : null
        )
      );
    if (timeblocksToAdd.length > 0) await addTimeBlocksBatch(timeblocksToAdd);
    const syncedServerTimeblocks = await fetchCurrentTimeBlocks(plan?.id);
    setSelectedTimeBlocks({
      planId: plan.id,
      data: syncedServerTimeblocks,
    });

    // Clear dirty state with the synced timeblocks
    clearDirtyStateWithTimeblocks(syncedServerTimeblocks);
  }, [
    fetchCurrentTimeBlocks,
    plan.id,
    user,
    selectedTimeBlocks,
    clearDirtyStateWithTimeblocks,
  ]);

  // --- Remove the auto-sync useEffect ---
  // useEffect(() => { ... if (editing.enabled) return; syncTimeBlocks(); }, [plan.id, user, selectedTimeBlocks, editing.enabled]);

  const [isSaving, setIsSaving] = useState(false);

  // Handle manual save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await syncTimeBlocks();
      router.refresh();
    } catch (error) {
      console.error('Failed to save timeblocks:', error);
    } finally {
      setIsSaving(false);
    }
  };

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
        handleSave,
        getPreviewUsers,
        getOpacityForDate,

        setUser,
        setFilteredUserIds: setFilteredUserIdsCallback,
        setPreviewDate: setPreviewDateCallback,
        setSelectedTimeBlocks: setSelectedTimeBlocksCallback,
        edit,
        endEditing,
        setDisplayMode: setDisplayModeCallback,
        syncTimeBlocks,
        resetLocalTimeblocks,
        markAsDirty,
        clearDirtyState,
        clearDirtyStateWithTimeblocks,
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
