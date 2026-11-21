import { z } from 'zod';
import { type FlagValue, getFlag, parseArgs } from './args';

const actions = [
  'list',
  'show',
  'claim',
  'release',
  'add-dependency',
  'add-follow-up',
] as const;
const actionSchema = z.enum(actions);
const credentialSchema = z.strictObject({
  assertion: z
    .string()
    .max(2048)
    .regex(/^[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}$/u),
  token: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/u)
    .optional(),
});
const help = `Fleet Board

Usage: ttr board <command> [options]

  list [--channel <id>] [--limit <n>] [--cursor <cursor>]
  show <task-id> --channel <id> [--limit <n>] [--cursor <cursor>]
  claim --channel <id> --request-id <uuid> [--ttl-ms <ms>]
  release <task-id> --channel <id> --request-id <uuid>
  add-dependency <task-id> <prerequisite-id> --workspace <id>
  add-follow-up <task-id> --channel <id> --request-id <uuid> --due-at-ms <ms>

Board requests use TUTURUUU_BOARD_URL (an HTTPS Ops Hub origin) and read
JSON credentials with an assertion from stdin. For release, also pass the
lease token in that JSON. The assertion must match the exact request.
Dependency creation uses the saved Tuturuuu CLI session.
Output is JSON. A successful claim includes a private lease token.
`;

type Flags = Record<string, FlagValue>;
type BoardRequest =
  | { method: 'GET'; path: string }
  | { method: 'POST'; path: string; requestId: string; body: object };

function requireUuid(value: string | undefined, label: string) {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new Error(`Expected a UUID for ${label}.`);
  return result.data.toLowerCase();
}

function integerFlag(flags: Flags, name: string, min: number, max: number) {
  if (flags[name] === undefined) return undefined;
  const value = getFlag(flags, name);
  const number = Number(value);
  if (!value || !/^[1-9][0-9]*$/u.test(value) || number < min || number > max)
    throw new Error(`--${name} requires an integer between ${min} and ${max}.`);
  return number;
}

function pageQuery(flags: Flags) {
  const query = new URLSearchParams();
  const limit = integerFlag(flags, 'limit', 1, 100);
  if (limit !== undefined) query.set('limit', String(limit));
  if (flags.cursor !== undefined) {
    const cursor = getFlag(flags, 'cursor');
    if (!cursor || cursor.length > 2400)
      throw new Error('--cursor requires a Fleet Board cursor.');
    query.set('cursor', cursor);
  }
  return query.size ? `?${query}` : '';
}

function requireOrigin(value: string | undefined) {
  const parsed = z.url().safeParse(value);
  const url = parsed.success ? new URL(parsed.data) : null;
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Set TUTURUUU_BOARD_URL to the HTTPS Ops Hub origin.');
  }
  return url.origin;
}

async function readCredentials(input: AsyncIterable<Uint8Array | string>) {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    length += buffer.byteLength;
    if (length > 4096) throw new Error('Fleet Board credentials exceed 4 KiB.');
    chunks.push(Buffer.from(buffer));
  }
  try {
    return credentialSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    );
  } catch {
    throw new Error('Expected Fleet Board credentials as JSON on stdin.');
  }
}

async function fetchBoard(
  origin: string,
  request: BoardRequest,
  assertion: string
): Promise<unknown> {
  const { createInternalApiClient } =
    await import('@tuturuuu/internal-api/client');
  const client = createInternalApiClient();
  const headers = new Headers({
    Accept: 'application/json',
    'X-Board-Assertion': assertion,
  });
  const init: RequestInit = {
    headers,
    method: request.method,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  };
  if (request.method === 'POST') {
    headers.set('Content-Type', 'application/json');
    headers.set('Idempotency-Key', request.requestId);
    init.body = JSON.stringify(request.body);
  }
  const requestFailed = (status?: number) => {
    const prefix = status
      ? `Fleet Board request failed (HTTP ${status}).`
      : 'Fleet Board request failed.';
    const uncertain =
      request.method === 'POST' &&
      (status === undefined || status === 408 || status >= 500);
    return new Error(
      uncertain
        ? `${prefix} Write outcome is unknown. Reconcile using the same request ID.`
        : prefix
    );
  };
  let response: Response;
  try {
    response = await client.fetch(origin + request.path, init);
    if (response.ok) return await response.json();
    await response.body?.cancel();
  } catch {
    throw requestFailed();
  }
  throw requestFailed(response.status);
}

async function addDependency(
  taskId: string,
  prerequisite: string,
  flags: Flags
): Promise<void> {
  if (taskId === prerequisite)
    throw new Error('A task cannot depend on itself.');
  const workspace = requireUuid(
    getFlag(flags, 'workspace') ?? getFlag(flags, 'ws'),
    '--workspace'
  );
  const { runCli } = await import('./commands.js');
  await runCli([
    'relationships',
    'create',
    taskId,
    '--workspace',
    workspace,
    '--json-payload',
    JSON.stringify({
      source_task_id: prerequisite,
      target_task_id: taskId,
      type: 'blocks',
    }),
    '--json',
    ...(flags['no-update-check'] === true ? ['--no-update-check'] : []),
  ]);
}

const actionFlags = {
  list: ['channel', 'limit', 'cursor'],
  show: ['channel', 'limit', 'cursor'],
  claim: ['channel', 'request-id', 'ttl-ms'],
  release: ['channel', 'request-id'],
  'add-dependency': ['workspace', 'ws', 'no-update-check'],
  'add-follow-up': ['channel', 'request-id', 'due-at-ms'],
} satisfies Record<(typeof actions)[number], string[]>;

export async function runBoardCommand(
  argv: string[],
  input: AsyncIterable<Uint8Array | string> = process.stdin
): Promise<void> {
  if (
    argv.length === 0 ||
    argv.some((arg) => arg === '--help' || arg === '-h') ||
    argv[0] === 'help'
  ) {
    process.stdout.write(help);
    return;
  }
  const { flags, positionals } = parseArgs(argv);
  const [rawAction, rawTask, rawPrerequisite] = positionals;
  const parsed = actionSchema.safeParse(rawAction);
  if (!parsed.success)
    throw new Error('Unknown Fleet Board command. Run `ttr board --help`.');
  const action = parsed.data;
  if (
    Object.keys(flags).some(
      (flag) => flag !== 'json' && !actionFlags[action].includes(flag)
    )
  )
    throw new Error('Unexpected Fleet Board option. Run `ttr board --help`.');
  const taskCount =
    action === 'add-dependency'
      ? 2
      : ['show', 'release', 'add-follow-up'].includes(action)
        ? 1
        : 0;
  if (positionals.length !== taskCount + 1)
    throw new Error('Wrong number of task IDs. Run `ttr board --help`.');
  if (action === 'add-dependency') {
    return addDependency(
      requireUuid(rawTask, 'task ID'),
      requireUuid(rawPrerequisite, 'prerequisite ID'),
      flags
    );
  }

  const channels = '/board/channels';
  const channel =
    action === 'list' && flags.channel === undefined
      ? undefined
      : requireUuid(getFlag(flags, 'channel'), '--channel');
  const channelPath = `${channels}/${channel}`;
  const task = taskCount ? requireUuid(rawTask, 'task ID') : undefined;
  const thread = `${channelPath}/threads/${task}`;
  const origin = requireOrigin(process.env.TUTURUUU_BOARD_URL);

  let request: BoardRequest;
  if (action === 'list' || action === 'show') {
    const path =
      action === 'show'
        ? `${thread}/messages`
        : channel
          ? `${channelPath}/threads`
          : channels;
    request = { method: 'GET', path: path + pageQuery(flags) };
  } else {
    const requestId = requireUuid(getFlag(flags, 'request-id'), '--request-id');
    if (action === 'claim') {
      const ttlMs = integerFlag(flags, 'ttl-ms', 30_000, 600_000);
      request = {
        method: 'POST',
        path: `${channelPath}/leases/claim`,
        requestId,
        body: { ttlMs },
      };
    } else if (action === 'add-follow-up') {
      const dueAt = integerFlag(flags, 'due-at-ms', 1, Number.MAX_SAFE_INTEGER);
      if (dueAt === undefined) throw new Error('--due-at-ms is required.');
      request = {
        method: 'POST',
        path: `${thread}/followups`,
        requestId,
        body: { dueAt, kind: 'verify_task', payload: { expected: 'done' } },
      };
    } else {
      request = {
        method: 'POST',
        path: `${channelPath}/leases/${task}/release`,
        requestId,
        body: {},
      };
    }
  }

  if (input === process.stdin && process.stdin.isTTY)
    throw new Error('Pipe Fleet Board credentials as JSON on stdin.');
  const { assertion, token } = await readCredentials(input);
  if (action === 'release' && request.method === 'POST') {
    if (!token)
      throw new Error('Release requires the lease token in stdin JSON.');
    request.body = { token };
  }
  process.stdout.write(
    `${JSON.stringify(await fetchBoard(origin, request, assertion))}\n`
  );
}
