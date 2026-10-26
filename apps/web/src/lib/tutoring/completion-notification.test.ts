// @vitest-environment node
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyCompletionSafely,
  notifyHomeroomTeachersOfCompletion,
  TUTORING_COMPLETED_CODE,
} from './completion-notification';

const wsId = 'ws-1';
const sessionId = 'session-1';

type Row = Record<string, unknown>;
type Filter = [op: 'eq' | 'in', column: string, value: unknown];

let tables: Record<string, Row[]>;
let rpc: ReturnType<typeof vi.fn>;

function matches(row: Row, filters: Filter[]) {
  return filters.every(([op, column, value]) =>
    op === 'eq'
      ? row[column] === value
      : (value as unknown[]).includes(row[column])
  );
}

function query(table: string) {
  const filters: Filter[] = [];
  const rows = () =>
    (tables[table] ?? []).filter((row) => matches(row, filters));
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push(['eq', column, value]);
      return builder;
    },
    in: (column: string, value: unknown) => {
      filters.push(['in', column, value]);
      return builder;
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: mirrors a Supabase builder
    then: (resolve: (value: { data: Row[]; error: null }) => void) =>
      resolve({ data: rows(), error: null }),
  };
  return builder;
}

function client() {
  return {
    from: query,
    rpc,
    schema: () => ({ from: query }),
  } as unknown as TypedSupabaseClient;
}

beforeEach(() => {
  rpc = vi.fn(async (_name: string, args: Row) => {
    tables.notifications?.push({
      code: args.p_code,
      entity_id: args.p_entity_id,
      entity_type: args.p_entity_type,
      user_id: args.p_user_id,
    });
    return { data: 'notification-id', error: null };
  });
  tables = {
    workspace_tutoring_sessions: [
      {
        id: sessionId,
        ws_id: wsId,
        group_id: 'group-1',
        student_user_id: 'student-1',
        attendance_status: 'DONE',
        session_date: '2026-10-26',
      },
    ],
    workspace_user_groups_users: [
      { group_id: 'group-1', user_id: 'homeroom-1', role: 'TEACHER' },
      { group_id: 'group-1', user_id: 'homeroom-2', role: 'TEACHER' },
      { group_id: 'group-1', user_id: 'unlinked-teacher', role: 'TEACHER' },
      { group_id: 'group-1', user_id: 'student-1', role: 'STUDENT' },
      { group_id: 'group-2', user_id: 'other-teacher', role: 'TEACHER' },
    ],
    workspace_user_linked_users: [
      { ws_id: wsId, virtual_user_id: 'homeroom-1', platform_user_id: 'u-1' },
      { ws_id: wsId, virtual_user_id: 'homeroom-2', platform_user_id: 'tutor' },
      {
        ws_id: wsId,
        virtual_user_id: 'other-teacher',
        platform_user_id: 'u-9',
      },
      { ws_id: wsId, virtual_user_id: 'student-1', platform_user_id: 'u-s' },
    ],
    notifications: [],
    workspace_user_groups: [{ id: 'group-1', name: 'IELTS 6A' }],
    workspace_users: [
      { id: 'student-1', full_name: 'Lan', display_name: null, email: null },
    ],
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tutoring completion notification', () => {
  it("notifies the class's linked homeroom teachers once, not the tutor", async () => {
    const sent = await notifyHomeroomTeachersOfCompletion({
      actorUserId: 'tutor',
      sbAdmin: client(),
      sessionId,
      wsId,
    });

    expect(sent).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'create_notification',
      expect.objectContaining({
        p_code: TUTORING_COMPLETED_CODE,
        p_entity_id: sessionId,
        p_entity_type: 'tutoring_session',
        p_type: 'system_announcement',
        p_user_id: 'u-1',
        p_ws_id: wsId,
        p_description:
          'Lan (IELTS 6A) completed a tutoring session on 2026-10-26.',
      })
    );
  });

  it('does not duplicate the notice when completion is retried', async () => {
    const input = { actorUserId: null, sbAdmin: client(), sessionId, wsId };
    expect(await notifyHomeroomTeachersOfCompletion(input)).toBe(2);
    expect(await notifyHomeroomTeachersOfCompletion(input)).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('sends nothing unless the session is completed', async () => {
    tables.workspace_tutoring_sessions![0]!.attendance_status = 'PENDING';
    expect(
      await notifyHomeroomTeachersOfCompletion({
        actorUserId: null,
        sbAdmin: client(),
        sessionId,
        wsId,
      })
    ).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never fails or stalls completion', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    rpc.mockRejectedValueOnce(new Error('rpc down'));
    await expect(
      notifyCompletionSafely({
        actorUserId: null,
        sbAdmin: client(),
        sessionId,
        wsId,
      })
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();

    vi.useFakeTimers();
    rpc.mockImplementation(() => new Promise(() => undefined));
    tables.notifications = [];
    const pending = notifyCompletionSafely({
      actorUserId: null,
      sbAdmin: client(),
      sessionId,
      wsId,
    });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toBeUndefined();
  });
});
