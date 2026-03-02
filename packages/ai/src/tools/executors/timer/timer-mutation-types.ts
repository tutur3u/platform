import type { Tables } from '@tuturuuu/types';

export type MutationError = { error: string };

export type TimerRelatedEntity = {
  id?: string;
  name?: string | null;
  color?: string | null;
} | null;

export type TimeTrackingCategory = Tables<'time_tracking_categories'>;

export interface TimerSession {
  id: string;
  title: string | null;
  startedAt: string | number;
  endedAt?: string | number | null;
  pausedAt?: string | number | null;
  elapsedMs?: number;
  durationSeconds?: number | null;
  durationFormatted?: string;
  description?: string | null;
  categoryId?: string | null;
  taskId?: string | null;
  isRunning?: boolean;
  pendingApproval?: boolean;
  wsId?: string;
  category?: TimerRelatedEntity;
  task?: TimerRelatedEntity;
}

export function toTimerSession(
  row: Record<string, unknown>,
  overrides: Partial<TimerSession> = {}
): TimerSession {
  const startedAt =
    typeof row.start_time === 'string' || typeof row.start_time === 'number'
      ? row.start_time
      : '';

  const baseSession: TimerSession = {
    id: typeof row.id === 'string' ? row.id : '',
    title: typeof row.title === 'string' ? row.title : null,
    startedAt,
    endedAt:
      typeof row.end_time === 'string' || typeof row.end_time === 'number'
        ? row.end_time
        : null,
    durationSeconds:
      typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    description: typeof row.description === 'string' ? row.description : null,
    categoryId: typeof row.category_id === 'string' ? row.category_id : null,
    taskId: typeof row.task_id === 'string' ? row.task_id : null,
    isRunning: typeof row.is_running === 'boolean' ? row.is_running : undefined,
    pendingApproval:
      typeof row.pending_approval === 'boolean'
        ? row.pending_approval
        : undefined,
    wsId: typeof row.ws_id === 'string' ? row.ws_id : undefined,
    category:
      row.category && typeof row.category === 'object'
        ? (row.category as TimerRelatedEntity)
        : null,
    task:
      row.task && typeof row.task === 'object'
        ? (row.task as TimerRelatedEntity)
        : null,
  };

  return { ...baseSession, ...overrides };
}

export type StartTimerResult =
  | MutationError
  | {
      success: true;
      message: string;
      session: TimerSession;
    };

export type StopTimerResult =
  | MutationError
  | {
      success: true;
      message: string;
      session: TimerSession;
    };

export type CreateTimeTrackingEntryResult =
  | MutationError
  | {
      success: true;
      requiresApproval: false;
      message: string;
      session: TimerSession;
    }
  | {
      success: true;
      requiresApproval: true;
      requestCreated: boolean;
      message?: string;
      nextStep?: string;
      approvalRequest?: {
        startTime: string;
        endTime: string;
        titleHint: string;
        descriptionHint: string | null;
      };
    };

export type UpdateTimeTrackingSessionResult =
  | MutationError
  | {
      success: true;
      message: string;
      session?: TimerSession;
    };

export type DeleteTimeTrackingSessionResult =
  | MutationError
  | {
      success: true;
      message: string;
    };

export type MoveTimeTrackingSessionResult =
  | MutationError
  | {
      success: true;
      message: string;
      session: TimerSession;
    };

export type TimerGoal = {
  id: string;
  ws_id: string;
  user_id: string;
  category_id: string | null;
  daily_goal_minutes: number;
  weekly_goal_minutes: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  category:
    | {
        id: string;
        name: string | null;
        color: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        color: string | null;
      }>
    | null;
};

export function normalizeGoalCategory(category: TimerGoal['category']) {
  if (!category) return null;
  if (Array.isArray(category)) return category[0] ?? null;
  return category;
}

export function normalizeGoalCategoryIdInput(
  value: unknown
): { ok: true; categoryId: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, categoryId: null };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'categoryId must be a string or null' };
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'general') {
    return { ok: true, categoryId: null };
  }

  return { ok: true, categoryId: trimmed };
}
