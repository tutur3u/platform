'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMeetPlanSnapshot,
  type MeetPlanSnapshot,
  replaceMeetAvailability,
} from '@tuturuuu/internal-api';
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
  startDate?: Date;
  endDate?: Date;
  tentativeMode?: boolean;
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
  canUndo: false,
  canRedo: false,
  handleSave: () => {},
  undo: () => {},
  redo: () => {},

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
  edit: (_: {
    mode: 'add' | 'remove';
    date: Date;
    tentativeMode?: boolean;
  }) => {},
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
  const queryClient = useQueryClient();
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
  const [undoStack, setUndoStack] = useState<Timeblock[][]>([]);
  const [redoStack, setRedoStack] = useState<Timeblock[][]>([]);

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
    ({
      mode,
      date,
      tentativeMode,
    }: {
      mode: 'add' | 'remove';
      date: Date;
      tentativeMode?: boolean;
    }) => {
      setEditing((prevData) => {
        const nextMode = prevData?.mode ?? mode;
        const nextTentativeMode = prevData?.tentativeMode ?? tentativeMode;
        const nextStart = prevData?.startDate ?? date;

        return {
          enabled: true,
          mode: nextMode,
          startDate: nextStart,
          endDate: date,
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
        setUndoStack((stack) => [...stack.slice(-19), selectedTimeBlocks.data]);
        setRedoStack([]);
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
  }, [plan.id, editing, selectedTimeBlocks.data]);

  const undo = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous || !plan.id) return;
    setRedoStack((stack) => [...stack.slice(-19), selectedTimeBlocks.data]);
    setUndoStack((stack) => stack.slice(0, -1));
    setSelectedTimeBlocks({ planId: plan.id, data: previous });
  }, [plan.id, selectedTimeBlocks.data, undoStack]);

  const redo = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next || !plan.id) return;
    setUndoStack((stack) => [...stack.slice(-19), selectedTimeBlocks.data]);
    setRedoStack((stack) => stack.slice(0, -1));
    setSelectedTimeBlocks({ planId: plan.id, data: next });
  }, [plan.id, redoStack, selectedTimeBlocks.data]);

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
      const snapshot = await getMeetPlanSnapshot(planId);
      queryClient.setQueryData(['meet-plan', planId], snapshot);
      return snapshot.timeblocks.filter(
        (tb: Timeblock) =>
          tb.user_id === user?.id && tb.is_guest === (user?.is_guest ?? false)
      );
    },
    [queryClient, user?.id, user?.is_guest]
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

  const availabilityMutation = useMutation({
    mutationFn: async (nextTimeblocks: Timeblock[]) => {
      if (!plan.id || !user?.id) throw new Error('A plan identity is required');
      return replaceMeetAvailability(plan.id, {
        guestId: user.is_guest ? user.id : undefined,
        passwordHash: user.is_guest ? user.password_hash : undefined,
        timeblocks: nextTimeblocks.map((timeblock) => ({
          date: timeblock.date,
          start_time: timeblock.start_time,
          end_time: timeblock.end_time,
          tentative: timeblock.tentative,
        })),
      });
    },
    onMutate: async (nextTimeblocks) => {
      if (!plan.id || !user?.id) return {};
      const queryKey = ['meet-plan', plan.id] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MeetPlanSnapshot>(queryKey);
      if (previous) {
        queryClient.setQueryData<MeetPlanSnapshot>(queryKey, {
          ...previous,
          timeblocks: [
            ...previous.timeblocks.filter(
              (timeblock) =>
                timeblock.user_id !== user.id ||
                timeblock.is_guest !== Boolean(user.is_guest)
            ),
            ...nextTimeblocks.map((timeblock) => ({
              ...timeblock,
              plan_id: plan.id,
              user_id: user.id,
              is_guest: Boolean(user.is_guest),
            })),
          ],
        });
      }
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (plan.id && context?.previous) {
        queryClient.setQueryData(['meet-plan', plan.id], context.previous);
      }
    },
    onSuccess: (snapshot) => {
      if (plan.id) queryClient.setQueryData(['meet-plan', plan.id], snapshot);
    },
  });

  const syncTimeBlocks = useCallback(async () => {
    if (!plan.id || !user?.id) return;
    const snapshot = await availabilityMutation.mutateAsync(
      selectedTimeBlocks.data
    );
    const synced = snapshot.timeblocks.filter(
      (timeblock) =>
        timeblock.user_id === user.id &&
        timeblock.is_guest === Boolean(user.is_guest)
    );
    setSelectedTimeBlocks({ planId: plan.id, data: synced });
    clearDirtyStateWithTimeblocks(synced);
  }, [
    availabilityMutation,
    clearDirtyStateWithTimeblocks,
    plan.id,
    selectedTimeBlocks.data,
    user,
  ]);

  const [isSaving, setIsSaving] = useState(false);

  // Handle manual save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await syncTimeBlocks();
      router.refresh();
    } catch (error) {
      console.error('Failed to save timeblocks:', error);
    } finally {
      setIsSaving(false);
    }
  }, [router, syncTimeBlocks]);

  useEffect(() => {
    if (editing.enabled || !isDirty || !user?.id || plan.is_confirmed) return;
    const timeout = window.setTimeout(() => {
      void handleSave();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [editing.enabled, handleSave, isDirty, plan.is_confirmed, user?.id]);

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
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        handleSave,
        undo,
        redo,
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
