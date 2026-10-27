import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type {
  BoardSprint,
  BoardSprintLengthWeeks,
  BoardSprintReport,
  BoardSprintsResponse,
} from '@tuturuuu/internal-api/task-sprints';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';
import { requireBoardAccess } from '../lists/access';

export const TASK_BOARD_SPRINT_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

export type SprintRouteParams = {
  boardId: string;
  sprintId?: string;
  wsId: string;
};

export const sprintIdSchema = z.guid();
export const goalResultSchema = z.enum(['met', 'partly', 'missed']);

// view: read sprints. plan: change goals and sprint membership (board editors).
// manage: turn sprints on, start and end them (workspace members who can edit).
export type SprintAccessLevel = 'view' | 'plan' | 'manage';

export async function requireSprintAccess(
  request: Request,
  params: SprintRouteParams,
  auth: SessionAuthContext,
  level: SprintAccessLevel
) {
  const access = await requireBoardAccess(request, params, auth, {
    requiredPermission: level === 'view' ? 'view' : 'edit',
  });
  if ('error' in access) return access;

  if (level === 'manage' && access.access.mode !== 'member') {
    return {
      error: NextResponse.json(
        { error: 'Only workspace members can start or end sprints' },
        { status: 403 }
      ),
    };
  }

  return access;
}

type SprintQueryError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

const MISSING_SCHEMA_CODES = new Set([
  '42P01',
  '42703',
  '42883',
  'PGRST202',
  'PGRST204',
  'PGRST205',
]);

// Code ships before its migration reaches production, so a missing sprint
// column, table or function reads as "sprints unavailable", not a failure.
export function isSprintSchemaUnavailable(error: SprintQueryError | null) {
  if (!error) return false;
  return MISSING_SCHEMA_CODES.has(error.code ?? '');
}

const RPC_ERROR_STATUS: Record<string, number> = {
  BOARD_NOT_FOUND: 404,
  SPRINT_NOT_FOUND: 404,
  SPRINT_NOT_PLANNED: 409,
  SPRINT_ALREADY_ACTIVE: 409,
  SPRINT_NOT_ACTIVE: 409,
  SPRINT_NOT_OPEN: 409,
  SPRINT_LENGTH_INVALID: 400,
  SPRINT_DECISIONS_INVALID: 400,
  SPRINT_GOAL_RESULT_INVALID: 400,
  SPRINT_TASK_NOT_ON_BOARD: 400,
  SPRINT_TOO_MANY_TASKS: 400,
};

export function sprintRpcErrorResponse(
  error: SprintQueryError,
  fallbackMessage: string
) {
  if (isSprintSchemaUnavailable(error)) {
    return NextResponse.json(
      {
        code: 'schema_unavailable',
        error:
          'Sprints are not available until the latest migration is applied',
      },
      { status: 503 }
    );
  }

  const code = Object.keys(RPC_ERROR_STATUS).find((key) =>
    error.message?.includes(key)
  );
  if (code) {
    return NextResponse.json(
      { code, error: code },
      { status: RPC_ERROR_STATUS[code] }
    );
  }

  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

const SPRINT_SELECT =
  'id, name, sequence_number, status, start_date, end_date, goal, goal_result, started_at, ended_at, task_cycle_tasks(task_id, added_after_start, carry_count, end_decision)';

type SprintRow = Omit<BoardSprint, 'tasks' | 'report'> & {
  task_cycle_tasks: BoardSprint['tasks'] | null;
};

type SprintReportRow = BoardSprintReport & { cycle_id: string };

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function serializeSprintReport(
  row: SprintReportRow | null | undefined
): BoardSprintReport | null {
  if (!row) return null;
  return {
    ended_at: row.ended_at,
    ended_by: row.ended_by,
    next_cycle_id: row.next_cycle_id,
    goal: row.goal,
    goal_result: row.goal_result,
    total_tasks: toNumber(row.total_tasks),
    done_tasks: toNumber(row.done_tasks),
    added_tasks: toNumber(row.added_tasks),
    carried_in_tasks: toNumber(row.carried_in_tasks),
    carried_tasks: toNumber(row.carried_tasks),
    backlog_tasks: toNumber(row.backlog_tasks),
    committed_points: toNumber(row.committed_points),
    done_points: toNumber(row.done_points),
    added_points: toNumber(row.added_points),
    people: Array.isArray(row.people)
      ? row.people.map((person) => ({
          user_id: person.user_id,
          total_tasks: toNumber(person.total_tasks),
          done_tasks: toNumber(person.done_tasks),
          total_points: toNumber(person.total_points),
          done_points: toNumber(person.done_points),
        }))
      : [],
  };
}

export function serializeSprint(
  row: SprintRow,
  report?: SprintReportRow | null
): BoardSprint {
  const { task_cycle_tasks, ...sprint } = row;
  return {
    ...sprint,
    tasks: (task_cycle_tasks ?? []).map((task) => ({
      task_id: task.task_id,
      added_after_start: task.added_after_start === true,
      carry_count: toNumber(task.carry_count),
      end_decision: task.end_decision ?? null,
    })),
    report: serializeSprintReport(report),
  };
}

const UNAVAILABLE: BoardSprintsResponse = {
  schemaAvailable: false,
  sprintLengthWeeks: null,
  sprints: [],
};

export async function loadBoardSprints(
  sbAdmin: TypedSupabaseClient,
  boardId: string
): Promise<
  | { ok: true; data: BoardSprintsResponse }
  | { ok: false; error: SprintQueryError }
> {
  const [boardResult, sprintsResult, reportsResult] = await Promise.all([
    sbAdmin
      .from('workspace_boards')
      .select('sprint_length_weeks')
      .eq('id', boardId)
      .maybeSingle(),
    sbAdmin
      .from('task_cycles')
      .select(SPRINT_SELECT)
      .eq('board_id', boardId)
      .not('deleted', 'is', true)
      .order('sequence_number', { ascending: true }),
    sbAdmin.from('task_sprint_reports').select('*').eq('board_id', boardId),
  ]);

  for (const result of [boardResult, sprintsResult, reportsResult]) {
    if (result.error) {
      if (isSprintSchemaUnavailable(result.error)) {
        return { ok: true, data: UNAVAILABLE };
      }
      return { ok: false, error: result.error };
    }
  }

  const reportsByCycleId = new Map(
    ((reportsResult.data ?? []) as unknown as SprintReportRow[]).map(
      (report) => [report.cycle_id, report]
    )
  );
  const weeks = boardResult.data?.sprint_length_weeks;

  return {
    ok: true,
    data: {
      schemaAvailable: true,
      sprintLengthWeeks:
        weeks === 1 || weeks === 2 ? (weeks as BoardSprintLengthWeeks) : null,
      sprints: ((sprintsResult.data ?? []) as unknown as SprintRow[]).map(
        (row) => serializeSprint(row, reportsByCycleId.get(row.id))
      ),
    },
  };
}

export async function requireBoardSprint(
  sbAdmin: TypedSupabaseClient,
  boardId: string,
  sprintId: string
): Promise<
  | { error: NextResponse; sprint?: never }
  | { error?: never; sprint: { id: string; status: string | null } }
> {
  const { data, error } = await sbAdmin
    .from('task_cycles')
    .select('id, status')
    .eq('id', sprintId)
    .eq('board_id', boardId)
    .not('deleted', 'is', true)
    .maybeSingle();

  if (error) {
    return { error: sprintRpcErrorResponse(error, 'Failed to load sprint') };
  }
  if (!data) {
    return {
      error: NextResponse.json({ error: 'Sprint not found' }, { status: 404 }),
    };
  }
  return { sprint: data };
}

export function invalidPayloadResponse() {
  return NextResponse.json(
    { error: 'Invalid request payload' },
    { status: 400 }
  );
}

export function sprintRouteErrorResponse(error: unknown, message: string) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return invalidPayloadResponse();
  }
  console.error(message, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
