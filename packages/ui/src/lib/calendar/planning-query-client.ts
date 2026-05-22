type QueryClientLike = {
  invalidateQueries: (options: {
    queryKey: unknown[];
    exact?: boolean;
  }) => Promise<unknown> | unknown;
  setQueriesData: (
    filters: { queryKey: unknown[]; exact?: boolean },
    updater: (oldData: unknown) => unknown
  ) => void;
};

export type OptimisticPlanningTask = {
  id: string;
  name: string;
  total_duration?: number | null;
  scheduled_minutes?: number;
  completed_minutes?: number;
  auto_schedule?: boolean | null;
  priority?: string | null;
  ws_id?: string;
};

export type OptimisticPlanningHabit = {
  id: string;
  name: string;
  is_active: boolean;
  auto_schedule?: boolean;
  is_visible_in_calendar?: boolean;
  color?: string;
};

export type OptimisticCalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  color?: string | null;
  locked?: boolean;
};

export async function invalidatePlanningQueries(
  queryClient: QueryClientLike,
  wsId: string,
  options?: {
    includeCalendarEvents?: boolean;
  }
) {
  const includeCalendarEvents = options?.includeCalendarEvents ?? true;

  const invalidations: Array<Promise<unknown> | unknown> = [
    queryClient.invalidateQueries({ queryKey: ['schedulable-tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['scheduled-events-batch'] }),
    queryClient.invalidateQueries({ queryKey: ['task-schedule-batch'] }),
    queryClient.invalidateQueries({ queryKey: ['habits', wsId] }),
    queryClient.invalidateQueries({
      queryKey: ['task-personal-schedule'],
      exact: false,
    }),
    queryClient.invalidateQueries({
      queryKey: ['task-schedule-history'],
      exact: false,
    }),
    queryClient.invalidateQueries({
      queryKey: ['habit-schedule-history'],
      exact: false,
    }),
    queryClient.invalidateQueries({
      queryKey: ['smart-schedule-preview', wsId],
      exact: false,
    }),
    queryClient.invalidateQueries({
      queryKey: ['smart-schedule-preview-dialog', wsId],
      exact: false,
    }),
  ];

  if (includeCalendarEvents) {
    invalidations.unshift(
      queryClient.invalidateQueries({
        queryKey: ['databaseCalendarEvents', wsId],
        exact: false,
      })
    );
  }

  await Promise.all(invalidations);
}

export function upsertOptimisticSchedulableTask(
  queryClient: QueryClientLike,
  task: OptimisticPlanningTask
) {
  queryClient.setQueriesData(
    { queryKey: ['schedulable-tasks'], exact: false },
    (oldData) => {
      if (!Array.isArray(oldData)) {
        return oldData;
      }

      const existingIndex = oldData.findIndex(
        (entry: any) => entry?.id === task.id
      );

      if (existingIndex >= 0) {
        return oldData.map((entry: any, index) =>
          index === existingIndex
            ? {
                ...entry,
                ...task,
              }
            : entry
        );
      }

      return [
        {
          ...task,
          scheduled_minutes: task.scheduled_minutes ?? 0,
          completed_minutes: task.completed_minutes ?? 0,
          auto_schedule: task.auto_schedule ?? true,
        },
        ...oldData,
      ];
    }
  );
}

export function upsertOptimisticHabit(
  queryClient: QueryClientLike,
  wsId: string,
  habit: OptimisticPlanningHabit
) {
  queryClient.setQueriesData(
    { queryKey: ['habits', wsId], exact: false },
    (oldData) => {
      if (!oldData || typeof oldData !== 'object') {
        return oldData;
      }

      const record = oldData as { habits?: unknown[] };
      if (!Array.isArray(record.habits)) {
        return oldData;
      }

      const existingIndex = record.habits.findIndex(
        (entry: any) => entry?.id === habit.id
      );

      const nextHabits =
        existingIndex >= 0
          ? record.habits.map((entry: any, index) =>
              index === existingIndex ? { ...entry, ...habit } : entry
            )
          : [{ ...habit }, ...record.habits];

      return {
        ...record,
        habits: nextHabits,
      };
    }
  );
}

export function patchCalendarEvents(
  queryClient: QueryClientLike,
  wsId: string,
  events: OptimisticCalendarEvent[],
  options?: { removeIds?: string[] }
) {
  const removeIds = new Set(options?.removeIds ?? []);

  queryClient.setQueriesData(
    { queryKey: ['databaseCalendarEvents', wsId], exact: false },
    (oldData) => {
      const existing = Array.isArray(oldData) ? [...oldData] : [];
      const withoutRemoved = existing.filter(
        (entry: any) => !removeIds.has(entry?.id)
      );
      const byId = new Map(
        withoutRemoved.map((entry: any) => [entry.id, entry])
      );

      for (const event of events) {
        if (!event.id) continue;
        byId.set(event.id, {
          ...(byId.get(event.id) ?? {}),
          ...event,
        });
      }

      return [...byId.values()].sort(
        (left: any, right: any) =>
          new Date(left.start_at).getTime() - new Date(right.start_at).getTime()
      );
    }
  );
}
