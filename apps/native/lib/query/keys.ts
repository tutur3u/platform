/**
 * Query key factory for TanStack Query
 *
 * Follows the pattern: [domain, subdomain?, paramsHash, version?]
 * This enables precise cache invalidation and prevents key collisions.
 *
 * @example
 * ```typescript
 * // List all tasks
 * useQuery({
 *   queryKey: queryKeys.tasks.list(wsId, { status: 'pending' }),
 *   queryFn: () => fetchTasks(wsId, filters)
 * });
 *
 * // Invalidate all tasks for a workspace
 * queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(wsId) });
 * ```
 */
export const queryKeys = {
  // Auth & User
  auth: {
    all: ['auth'] as const,
    session: () => [...queryKeys.auth.all, 'session'] as const,
    user: () => [...queryKeys.auth.all, 'user'] as const,
  },

  // Workspaces
  workspaces: {
    all: ['workspaces'] as const,
    list: (userId: string) =>
      [...queryKeys.workspaces.all, 'list', userId] as const,
    detail: (wsId: string) => [...queryKeys.workspaces.all, wsId] as const,
    members: (wsId: string) =>
      [...queryKeys.workspaces.detail(wsId), 'members'] as const,
    permissions: (wsId: string) =>
      [...queryKeys.workspaces.detail(wsId), 'permissions'] as const,
  },

  // Tasks
  tasks: {
    all: (wsId: string) => ['tasks', wsId] as const,
    list: (wsId: string, filters?: TaskFilters) =>
      [...queryKeys.tasks.all(wsId), 'list', filters ?? {}] as const,
    detail: (wsId: string, taskId: string) =>
      [...queryKeys.tasks.all(wsId), taskId] as const,
    boards: (wsId: string) => [...queryKeys.tasks.all(wsId), 'boards'] as const,
    board: (wsId: string, boardId: string) =>
      [...queryKeys.tasks.boards(wsId), boardId] as const,
  },

  // Calendar
  calendar: {
    all: (wsId: string) => ['calendar', wsId] as const,
    events: (wsId: string, range: DateRange) =>
      [...queryKeys.calendar.all(wsId), 'events', range] as const,
    event: (wsId: string, eventId: string) =>
      [...queryKeys.calendar.all(wsId), eventId] as const,
    calendars: (wsId: string) =>
      [...queryKeys.calendar.all(wsId), 'calendars'] as const,
  },

  // Finance
  finance: {
    all: (wsId: string) => ['finance', wsId] as const,
    transactions: (wsId: string, filters?: TransactionFilters) =>
      [...queryKeys.finance.all(wsId), 'transactions', filters ?? {}] as const,
    transaction: (wsId: string, transactionId: string) =>
      [...queryKeys.finance.all(wsId), 'transaction', transactionId] as const,
    wallets: (wsId: string) =>
      [...queryKeys.finance.all(wsId), 'wallets'] as const,
    wallet: (wsId: string, walletId: string) =>
      [...queryKeys.finance.wallets(wsId), walletId] as const,
    categories: (wsId: string) =>
      [...queryKeys.finance.all(wsId), 'categories'] as const,
    summary: (wsId: string, range: DateRange) =>
      [...queryKeys.finance.all(wsId), 'summary', range] as const,
  },

  // Time Tracking
  timeTracker: {
    all: (wsId: string) => ['timeTracker', wsId] as const,
    sessions: (wsId: string, filters?: SessionFilters) =>
      [...queryKeys.timeTracker.all(wsId), 'sessions', filters ?? {}] as const,
    session: (wsId: string, sessionId: string) =>
      [...queryKeys.timeTracker.all(wsId), sessionId] as const,
    running: (wsId: string, userId: string) =>
      [...queryKeys.timeTracker.all(wsId), 'running', userId] as const,
    categories: (wsId: string) =>
      [...queryKeys.timeTracker.all(wsId), 'categories'] as const,
    goals: (wsId: string) =>
      [...queryKeys.timeTracker.all(wsId), 'goals'] as const,
  },

  // Settings & Profile
  settings: {
    all: ['settings'] as const,
    user: () => [...queryKeys.settings.all, 'user'] as const,
    workspace: (wsId: string) =>
      [...queryKeys.settings.all, 'workspace', wsId] as const,
  },

  // Version check
  version: {
    all: ['version'] as const,
    check: () => [...queryKeys.version.all, 'check'] as const,
  },
} as const;

// Filter types for type safety
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export type TaskFilters = {
  status?: string;
  priority?: TaskPriority;
  assigneeId?: string;
  boardId?: string;
  listId?: string;
  search?: string;
};

export type DateRange = {
  start: string; // ISO date string
  end: string; // ISO date string
};

export type TransactionFilters = {
  walletId?: string;
  categoryId?: string;
  type?: 'income' | 'expense';
  startDate?: string;
  endDate?: string;
  search?: string;
};

export type SessionFilters = {
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
};
