import { signMeetFinalizeToken } from '@tuturuuu/realtime/meet/finalization-token';
import { vi } from 'vitest';

export const SECRET = 'finalize-test-secret';
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ws = id(1);
export const meeting = id(2);
export const sessionId = id(3);
export const host = id(10);
export const ada = id(11);
export const ben = id(12);
export const SECRET_TEXT = 'BEN-PRIVATE-SPEECH';

export type Row = Record<string, unknown>;
export function chunk(sequence: number, accountId: string | null, text: string): Row {
  return {
    id: id(100 + sequence),
    session_id: sessionId,
    sequence,
    start_seconds: sequence * 10,
    duration_seconds: 10,
    status: 'completed',
    transcript: text,
    attempt_started_at: null,
    created_at: '2026-10-30T00:00:00Z',
    usage: accountId
      ? {
          segments: [
            {
              speaker: { accountId, displayName: 'X', kind: 'microphone' },
              kind: 'microphone',
              startSeconds: sequence * 10,
              transcript: text,
            },
          ],
        }
      : {},
  };
}
export type Fail = (table: string, patch: Row) => boolean;
export function fakeDb(
  tables: Record<string, Row[]>,
  log: string[] = [],
  failWhen: () => Fail | null = () => null
) {
  const rpc = vi.fn(async () => ({ error: null, data: 'n' }));
  const from = (table: string) => {
    let op: 'select' | 'update' = 'select';
    let patch: Row = {};
    const filters: Array<(row: Row) => boolean> = [];
    // The claim is atomic: it is evaluated synchronously when awaited.
    const run = () => {
      const rows = (tables[table] ?? []).filter((row) =>
        filters.every((test) => test(row))
      );
      if (op === 'update' && failWhen()?.(table, patch)) {
        log.push(
          `${table}.update-failed:${Object.keys(patch).sort().join(',')}`
        );
        return { rows: [] as Row[], error: { message: 'storage down' } };
      }
      if (op === 'update') {
        log.push(`${table}.update:${Object.keys(patch).sort().join(',')}`);
        for (const row of rows) Object.assign(row, patch);
      } else log.push(`${table}.select`);
      return { rows, error: null as { message: string } | null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (value: Row) => {
        op = 'update';
        patch = value;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return chain;
      },
      order: () => chain,
      range: () => chain,
      single: async () => {
        const out = run();
        return { data: out.rows[0] ?? null, error: out.error };
      },
      maybeSingle: async () => {
        const out = run();
        return { data: out.rows[0] ?? null, error: out.error };
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
      then: (resolve: (value: unknown) => void) =>
        resolve((({ rows, error }) => ({ data: rows, error }))(run())),
    };
    return chain;
  };
  return { from, rpc };
}

export function buildTables(overrides: { chunks?: Row[]; session?: Row } = {}) {
  return {
    workspace_meetings: [
      {
        id: meeting,
        ws_id: ws,
        creator_id: host,
        time: '2026-10-30T00:00:00Z',
      },
    ],
    workspace_members: [
      { ws_id: ws, user_id: host },
      { ws_id: ws, user_id: ada },
    ],
    meet_ai_sessions: [
      {
        id: sessionId,
        meeting_id: meeting,
        user_id: host,
        notes: null,
        notes_status: 'pending',
        notes_started_at: null,
        notes_unpriced_attempts: 0,
        ended_at: null,
        ...overrides.session,
      },
    ],
    meet_ai_chunks: overrides.chunks ?? [
      chunk(0, ada, 'ADA-SPEECH'),
      chunk(1, ben, SECRET_TEXT),
      chunk(2, null, 'UNATTRIBUTED-SPEECH'),
    ],
  };
}

export const bearer = (consented = [ada, host], readers = [ada]) =>
  signMeetFinalizeToken(
    {
      sessionId,
      meetingId: meeting,
      wsId: ws,
      consentedAccountIds: consented,
      readerAccountIds: readers,
      queuedAt: 0,
      attempts: 1,
      nextAttemptAt: 0,
      status: 'pending',
    },
    SECRET,
    Date.now()
  );
