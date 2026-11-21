import type { FleetReply } from '@tuturuuu/internal-api/mastermind-threads';
import type {
  ProjectsSnapshot,
  StateCounts,
  ThreadMachine,
  ThreadMessages,
  ThreadPage,
  ThreadResult,
  ThreadRow,
  ThreadState,
} from './contract';
import type { ThreadsClient } from './upstream';

/** The owner id fixture builds key their browser cache by. */
export const FIXTURE_OWNER = 'fixture-owner';
const MACHINE_ID = 'fixture';

const BASE = Date.parse('2026-11-22T00:30:00Z');
const STATES: ThreadState[] = ['running', 'waiting', 'idle', 'idle', 'failed'];
const PROJECTS = [
  ['tuturuuu', 'tuturuuu', 120],
  ['mira', 'Mira', 6],
  ['channels', 'Channels', 2],
  ['fysh', 'fysh admin', 1],
] as const;

function row(index: number, project?: readonly [string, string]): ThreadRow {
  const state = STATES[index % STATES.length] ?? 'idle';
  return {
    threadId: `thread:${project?.[0] ?? 'none'}-${index}`,
    title: `${project?.[1] ?? 'Unassigned'} thread ${index + 1}`,
    projectId: project?.[0],
    project: project?.[1],
    state,
    updatedAt: new Date(BASE - index * 7 * 60_000).toISOString(),
    itemCount: 20 + index,
    seenItemCount: index % 4 === 0 ? undefined : 20 + index - (index % 3),
  };
}

const ROWS: ThreadRow[] = [
  ...PROJECTS.flatMap(([id, name, n]) =>
    Array.from({ length: n }, (_, i) => row(i, [id, name]))
  ),
  ...Array.from({ length: 3 }, (_, i) => row(i)),
].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

function counts(rows: ThreadRow[]): StateCounts {
  const c = { running: 0, waiting: 0, failed: 0, idle: 0 };
  for (const r of rows) c[r.state]++;
  return c;
}

function ok<T>(data: T): ThreadResult<T> {
  return { kind: 'ok', data, fetchedAt: new Date().toISOString() };
}

const MACHINES: ThreadMachine[] = [
  { label: 'This machine', reachable: true },
  { environmentId: 'env-studio', label: 'MacStudio1', reachable: true },
  { environmentId: 'env-c02', label: 'C02', reachable: false },
];

/** The thread routes over in-memory rows, for local development and tests. */
export function createFixtureThreadsClient(): ThreadsClient {
  return {
    machines: async () => ok({ machineId: MACHINE_ID, machines: MACHINES }),
    async projects() {
      const snapshot: ProjectsSnapshot = {
        machineId: MACHINE_ID,
        total: PROJECTS.length,
        projects: PROJECTS.map(([projectId, project]) => {
          const rows = ROWS.filter((r) => r.projectId === projectId);
          return {
            projectId,
            project,
            threadCount: rows.length,
            counts: counts(rows),
            latestUpdatedAt: rows[0]?.updatedAt ?? new Date(BASE).toISOString(),
          };
        }),
        unassigned: (() => {
          const rows = ROWS.filter((r) => !r.projectId);
          return { threadCount: rows.length, counts: counts(rows) };
        })(),
      };
      return ok(snapshot);
    },
    async threads(_machineId, input) {
      if (input.environmentId === 'env-c02')
        return { kind: 'error', code: 'machine_offline' };
      if (input.environmentId && input.projectId === 'none')
        return { kind: 'error', code: 'unsupported_for_linked_machine' };
      const q = input.q?.toLowerCase();
      const rows = ROWS.filter(
        (r) =>
          (!input.projectId ||
            (input.projectId === 'none'
              ? !r.projectId
              : r.projectId === input.projectId)) &&
          (!input.state || r.state === input.state) &&
          (!q || r.title.toLowerCase().includes(q))
      );
      const start = input.cursor ?? 0;
      const limit = input.limit ?? 50;
      const page: ThreadPage = {
        machineId: MACHINE_ID,
        threads: rows.slice(start, start + limit),
        nextCursor: start + limit < rows.length ? start + limit : null,
        total: rows.length,
      };
      return ok(page);
    },
    async messages(_machineId, input) {
      const thread = ROWS.find((r) => r.threadId === input.threadId);
      if (!thread) return { kind: 'error', code: 'not_found' };
      const end = input.before ?? 40;
      const start = Math.max(0, end - (input.limit ?? 30));
      const data: ThreadMessages = {
        machineId: MACHINE_ID,
        thread,
        messages: Array.from({ length: end - start }, (_, i) => {
          const position = start + i;
          return {
            position,
            role: position % 2 ? 'assistant' : 'user',
            text:
              position % 7 === 3
                ? 'Token rotated: [redacted]. The deploy continues.'
                : `Message ${position + 1} in ${thread.title}.`,
            truncated: position % 11 === 5,
            at: new Date(BASE - (40 - position) * 60_000).toISOString(),
          } as const;
        }),
        earlierPosition: start > 0 ? start : null,
      };
      return ok(data);
    },
    async reply(machineId, input) {
      const reply: FleetReply = {
        id: input.idempotencyKey,
        machineId,
        threadId: input.threadId,
        environmentId: input.environmentId,
        state: 'delivered',
        delivery: 'steered',
        createdAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
      };
      return { ok: true, data: reply };
    },
    markRead: async () => ok({ saved: true }),
    receipt: async () => ({ ok: false, error: 'not_found', status: 404 }),
    bridgeMachineId: async () => 'fixture',
  };
}
