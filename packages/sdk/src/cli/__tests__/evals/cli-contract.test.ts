/**
 * Eval pyramid, base tier: deterministic contract evals for the commands
 * agents call most. Each case runs the real `ttr` entrypoint against the fake
 * HTTP world and checks the exit code, stdout/stderr contract, the requests
 * sent, and the invariants every case shares (no credential leaks, no stack
 * traces, no unrouted or off-platform requests, no terminal escapes).
 * Adding a command is one table entry.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';
import {
  installSafeBaseline,
  invokeTtr,
  type TtrInvocation,
} from './cli-eval-entry-test-fixtures';
import {
  createEvalHome,
  createFakeApi,
  EVAL_BASE_URL,
  EVAL_SECRETS,
  EVAL_TASKS_BASE_URL,
  type EvalHome,
  type EvalSessionState,
  type FakeApi,
  LIST_ID,
  type RouteTable,
  TASK_ID,
  WORKSPACE_ID,
} from './cli-eval-test-fixtures';
import {
  createWorldRoutes,
  jsonBody,
  routeKeys,
} from './cli-eval-world-test-fixtures';

vi.mock('../../commands.js', async (importOriginal) =>
  (await import('./cli-eval-entry-test-fixtures.js')).trackEntryModule(
    await importOriginal<typeof import('../../commands')>(),
    'runCli'
  )
);
vi.mock('../../resources.js', async (importOriginal) =>
  (await import('./cli-eval-entry-test-fixtures.js')).trackEntryModule(
    await importOriginal<typeof import('../../resources')>(),
    'runResourcesCommand'
  )
);
vi.mock('../../git-guard.js', async (importOriginal) =>
  (await import('./cli-eval-entry-test-fixtures.js')).trackEntryModule(
    await importOriginal<typeof import('../../git-guard')>(),
    'runGitCommand'
  )
);

interface ContractContext {
  api: FakeApi;
  home: EvalHome;
  result: TtrInvocation;
}

interface ContractCase {
  argv: string[];
  /**
   * Failures explain themselves on stderr. A case that documents an existing
   * exception names it here so the gap stays visible until it is fixed.
   */
  knownGap?: 'failure-without-stderr';
  exitCode: 0 | 1;
  /** Parsed stdout must satisfy this schema. */
  json?: z.ZodType;
  name: string;
  /** Ordered `METHOD pathname` list the command must send, and nothing else. */
  requests?: string[];
  routes?: RouteTable;
  session?: EvalSessionState;
  stderr?: RegExp;
  stdout?: RegExp;
  verify?: (context: ContractContext) => void | Promise<void>;
}

const tasksPath = `/api/v1/workspaces/${WORKSPACE_ID}/tasks`;
const taskSchema = z.object({ id: z.string(), name: z.string() });
const ESCAPE_OR_BELL = /[\u001b\u0007]/u;

const cases: ContractCase[] = [
  // ttr tasks
  {
    name: 'tasks list --json returns the counted task page',
    argv: ['tasks', 'list', '--json'],
    exitCode: 0,
    json: z.object({
      count: z.literal(1),
      tasks: z
        .array(taskSchema.extend({ workspace_id: z.literal(WORKSPACE_ID) }))
        .length(1),
    }),
    requests: ['GET /api/v1/workspaces', `GET ${tasksPath}`],
    verify: ({ api }) => {
      const query = api.requests[1]?.url.searchParams;
      expect(query?.get('limit')).toBe('50');
      expect(query?.get('includeCount')).toBe('true');
    },
  },
  {
    name: 'tasks list renders a human table',
    argv: ['tasks', 'list'],
    exitCode: 0,
    stdout: /EVAL-7.*Write the eval pyramid/u,
  },
  {
    name: 'tasks get resolves a ticket identifier before reading the task',
    argv: ['tasks', 'get', 'EVAL-7', '--json'],
    exitCode: 0,
    json: z.object({ task: taskSchema.extend({ id: z.literal(TASK_ID) }) }),
    requests: [`GET ${tasksPath}`, `GET ${tasksPath}/${TASK_ID}`],
    verify: ({ api }) => {
      expect(api.requests[0]?.url.searchParams.get('identifier')).toBe(
        'EVAL-7'
      );
    },
  },
  {
    name: 'tasks get reports an unknown identifier',
    argv: ['tasks', 'get', 'EVAL-404', '--json'],
    routes: { [routeKeys.listTasks]: () => ({ tasks: [] }) },
    exitCode: 1,
    stderr: /^Task identifier EVAL-404 was not found\.\n$/u,
    requests: [`GET ${tasksPath}`],
  },
  {
    name: 'tasks create posts the name and list',
    argv: ['tasks', 'create', 'Ship the evals', '--list', LIST_ID, '--json'],
    exitCode: 0,
    json: z.object({
      task: taskSchema.extend({ name: z.literal('Ship the evals') }),
    }),
    requests: [`POST ${tasksPath}`],
    verify: ({ api }) => {
      expect(jsonBody(api.requests[0]!)).toMatchObject({
        listId: LIST_ID,
        name: 'Ship the evals',
      });
    },
  },
  {
    name: 'tasks create refuses interactive list selection under --json',
    argv: ['tasks', 'create', '--json'],
    exitCode: 1,
    stderr: /^Interactive selection is not available with --json\.\n$/u,
    requests: [],
  },
  {
    name: 'tasks update sends the JSON payload',
    argv: [
      'tasks',
      'update',
      'EVAL-7',
      '--json-payload',
      '{"name":"Renamed"}',
      '--json',
    ],
    exitCode: 0,
    json: z.object({ task: taskSchema.extend({ name: z.literal('Renamed') }) }),
    verify: ({ api }) => {
      const update = api.requests.find((request) => request.method === 'PUT');
      expect(update?.url.pathname).toBe(`${tasksPath}/${TASK_ID}`);
      expect(jsonBody(update!)).toEqual({ name: 'Renamed' });
    },
  },
  {
    name: 'tasks update rejects malformed JSON without mutating',
    argv: ['tasks', 'update', 'EVAL-7', '--json-payload', '{bad'],
    exitCode: 1,
    stderr: /JSON/u,
    verify: ({ api }) => {
      expect(api.requests.some((request) => request.method === 'PUT')).toBe(
        false
      );
    },
  },
  {
    name: 'tasks list surfaces the API error message on 5xx',
    argv: ['tasks', 'list', '--json'],
    routes: {
      [routeKeys.listTasks]: () =>
        Response.json(
          { error: 'Internal failure', message: 'database unavailable' },
          { status: 500 }
        ),
    },
    exitCode: 1,
    stderr: /^database unavailable\n$/u,
  },
  {
    name: 'tasks list reports a non-JSON gateway failure by status',
    argv: ['tasks', 'list', '--json'],
    routes: {
      [routeKeys.listTasks]: () =>
        new Response('<html>bad gateway</html>', { status: 502 }),
    },
    exitCode: 1,
    stderr: /^Internal API request failed: 502\n$/u,
  },
  {
    name: 'tasks get reports a permission error',
    argv: ['tasks', 'get', 'EVAL-7', '--json'],
    routes: {
      [routeKeys.getTask]: () =>
        Response.json({ error: 'Forbidden' }, { status: 403 }),
    },
    exitCode: 1,
    stderr: /^Forbidden\n$/u,
  },
  {
    name: 'tasks list requires a session before any request',
    argv: ['tasks', 'list', '--json'],
    session: 'logged-out',
    exitCode: 1,
    stderr: /^Not logged in\. Run `ttr login` first\.\n$/u,
    requests: [],
  },
  // ttr boards
  {
    name: 'boards list --json returns active boards',
    argv: ['boards', 'list', '--json'],
    exitCode: 0,
    json: z.object({
      boards: z
        .array(z.object({ id: z.string(), name: z.literal('Eval Board') }))
        .length(1),
      count: z.literal(1),
    }),
    requests: [`GET /api/v1/workspaces/${WORKSPACE_ID}/task-boards`],
  },
  {
    name: 'boards list forwards search and paging flags',
    argv: [
      'boards',
      'list',
      '--q',
      'eval',
      '--page',
      '2',
      '--page-size',
      '5',
      '--json',
    ],
    exitCode: 0,
    verify: ({ api }) => {
      expect(
        Object.fromEntries(api.requests[0]?.url.searchParams ?? [])
      ).toEqual({
        page: '2',
        pageSize: '5',
        q: 'eval',
        status: 'active',
      });
    },
  },
  {
    name: 'boards list renders a human table',
    argv: ['boards', 'list'],
    exitCode: 0,
    stdout: /Eval Board/u,
  },
  // ttr whoami
  {
    name: 'whoami --json describes the session without its tokens',
    argv: ['whoami', '--json'],
    exitCode: 0,
    json: z.object({
      baseUrl: z.literal(EVAL_BASE_URL),
      currentWorkspace: z.object({ id: z.literal(WORKSPACE_ID) }),
      loggedIn: z.literal(true),
      session: z.literal('Tuturuuu CLI'),
      user: z.object({ email: z.literal('agent@eval.test') }),
    }),
    requests: [
      'GET /api/v1/users/me/profile',
      'GET /api/v1/users/me/default-workspace',
      'GET /api/v1/workspaces',
    ],
  },
  {
    name: 'whoami --json works logged out without network access',
    argv: ['whoami', '--json'],
    session: 'logged-out',
    exitCode: 0,
    json: z.object({
      loggedIn: z.literal(false),
      session: z.null(),
      user: z.null(),
    }),
    requests: [],
  },
  {
    name: 'whoami strips terminal control sequences from API data',
    argv: ['whoami'],
    routes: {
      [routeKeys.profile]: () => ({
        display_name: 'Eval\u001b[2J\u001b]0;owned\u0007 Agent',
        email: 'agent@eval.test',
        id: 'user-1',
      }),
    },
    exitCode: 0,
    stdout: /Status: logged in/u,
  },
  // ttr resources
  {
    name: 'resources status --json reports local admission state only',
    argv: ['resources', 'status', '--json'],
    exitCode: 0,
    json: z.object({
      config: z.object({ state: z.string() }),
      enabled: z.boolean(),
      machine: z.object({
        cpus: z.number().int().positive(),
        platform: z.string(),
      }),
      version: z.string(),
    }),
    requests: [],
    verify: ({ home, result }) => {
      expect(result.json<{ home: string }>().home).toBe(
        `${home.directory}/resources`
      );
    },
  },
  {
    name: 'resources status rejects unknown options',
    argv: ['resources', 'status', '--bogus'],
    exitCode: 1,
    stderr: /^Unknown status option: --bogus\n$/u,
    requests: [],
  },
  // ttr git guard
  {
    name: 'git guard status --json reports the isolated guard home',
    argv: ['git', 'guard', 'status', '--json'],
    exitCode: 0,
    json: z.object({
      enabled: z.boolean(),
      hook: z.object({ installed: z.boolean() }),
      repos: z.array(z.object({ path: z.string() })),
    }),
    requests: [],
    verify: ({ home, result }) => {
      expect(result.json<{ home: string }>().home).toBe(
        `${home.directory}/git-guard`
      );
    },
  },
  {
    name: 'git guard rejects unknown actions',
    argv: ['git', 'guard', 'bogus'],
    exitCode: 1,
    stderr: /^Unknown git guard action "bogus"\. Use ttr git guard help\.\n$/u,
  },
  {
    name: 'git with an unknown scope prints guard help and fails',
    argv: ['git', 'nope'],
    exitCode: 1,
    knownGap: 'failure-without-stderr',
    stdout: /Usage: ttr git guard/u,
  },
];

let baseline: { directory: string; restore: () => void } | undefined;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ttr-cli-eval-baseline-'));
  baseline = { directory, restore: installSafeBaseline(directory) };
});
afterAll(async () => {
  baseline?.restore();
  if (baseline) await rm(baseline.directory, { force: true, recursive: true });
});

const homes: EvalHome[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => home.remove()));
});

describe('ttr contract evals', () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    '%s',
    async (_name, entry) => {
      const home = await createEvalHome(entry.session ?? 'logged-in');
      homes.push(home);
      const api = createFakeApi(createWorldRoutes(entry.routes));
      const result = await invokeTtr(entry.argv, {
        api,
        env: { TTR_GIT_GUARD_HOME: `${home.directory}/git-guard` },
        home,
      });
      const context = { api, home, result };

      expect({
        exitCode: result.exitCode,
        stderr: result.stderr,
      }).toMatchObject({
        exitCode: entry.exitCode,
      });
      if (entry.exitCode === 0) expect(result.stderr).toBe('');
      else if (entry.knownGap === 'failure-without-stderr')
        expect(result.stderr).toBe('');
      else expect(result.stderr.trim()).not.toBe('');
      if (entry.stdout) expect(result.stdout).toMatch(entry.stdout);
      if (entry.stderr) expect(result.stderr).toMatch(entry.stderr);
      if (entry.json) entry.json.parse(result.json());
      if (
        entry.json === undefined &&
        entry.argv.includes('--json') &&
        entry.exitCode === 1
      ) {
        // A failed --json command must not leave partial JSON for agents to parse.
        expect(result.stdout).toBe('');
      }
      if (entry.requests) {
        expect(
          api.requests.map(
            (request) => `${request.method} ${request.url.pathname}`
          )
        ).toEqual(entry.requests);
      }

      // Invariants shared by every case.
      expect(result.leakedSecrets).toEqual([]);
      expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/\n\s+at\s/u);
      expect(`${result.stdout}${result.stderr}`).not.toMatch(ESCAPE_OR_BELL);
      expect(api.unmatched).toEqual([]);
      for (const request of api.requests) {
        expect([EVAL_BASE_URL, EVAL_TASKS_BASE_URL]).toContain(
          request.url.origin
        );
        if (request.authorization) {
          expect(request.authorization).toBe(
            `Bearer ${EVAL_SECRETS.accessToken}`
          );
        }
      }
      await entry.verify?.(context);
    }
  );
});
