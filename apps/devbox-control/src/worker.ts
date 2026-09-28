import { RunnerWake } from './wake';

export { RunnerWake };

interface Env {
  DEVBOX_CONTROL_INTERNAL_TOKEN: string;
  RUNNER_WAKE: DurableObjectNamespace<RunnerWake>;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
}

type Runner = {
  actor_id: string;
  heartbeat_enabled: boolean;
  id: string;
  status: string;
};

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^tdbx_[0-9a-f]{64}$/;
const LANGUAGES = new Set([
  'python',
  'javascript',
  'typescript',
  'c',
  'cpp',
  'java',
  'rust',
  'go',
  'ruby',
  'php',
]);

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

function supabaseHeaders(
  env: Env,
  schema: 'private' | 'public',
  write = false
) {
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    [write ? 'Content-Profile' : 'Accept-Profile']: schema,
    'Content-Type': 'application/json',
  };
}

async function query<T>(
  env: Env,
  path: string,
  schema: 'private' | 'public',
  init?: RequestInit
): Promise<T> {
  const response = await fetch(new URL(path, env.SUPABASE_URL), {
    ...init,
    headers: {
      ...supabaseHeaders(
        env,
        schema,
        init?.method !== undefined && init.method !== 'GET'
      ),
      ...init?.headers,
    },
  });
  if (!response.ok)
    throw new Error(`Supabase request failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  )
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function authorize(
  request: Request,
  env: Env,
  requireOnline: boolean
): Promise<Runner | null> {
  const token = request.headers.get('X-Devbox-Runner-Token') ?? '';
  if (!TOKEN.test(token)) return null;
  const hash = await digest(token);
  const tokens = await query<{ runner_id: string }[]>(
    env,
    `/rest/v1/devbox_runner_tokens?select=runner_id&token_hash=eq.${hash}&revoked_at=is.null&limit=1`,
    'private'
  );
  const runnerId = tokens[0]?.runner_id;
  if (!runnerId || !UUID.test(runnerId)) return null;
  const runners = await query<Runner[]>(
    env,
    `/rest/v1/devbox_runners?select=id,actor_id,status,heartbeat_enabled&id=eq.${runnerId}&limit=1`,
    'private'
  );
  const runner = runners[0];
  if (
    !runner ||
    !UUID.test(runner.actor_id) ||
    (requireOnline
      ? runner.status !== 'online'
      : !['registered', 'online'].includes(runner.status))
  )
    return null;
  const members = await query<{ type: string }[]>(
    env,
    `/rest/v1/workspace_members?select=type&ws_id=eq.${ROOT_WORKSPACE_ID}&user_id=eq.${runner.actor_id}&limit=1`,
    'public'
  );
  return members[0]?.type === 'MEMBER' ? runner : null;
}

async function boundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new Error('Body too large');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } finally {
    await reader.cancel();
  }
}

function isCapabilities(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        ![
          'cli',
          'judge',
          'os',
          'reportedAt',
          'resources',
          'runtimes',
          'tools',
        ].includes(key)
    )
  )
    return false;
  const judge = data.judge;
  if (judge !== undefined) {
    if (!judge || typeof judge !== 'object' || Array.isArray(judge))
      return false;
    const item = judge as Record<string, unknown>;
    if (
      typeof item.ready !== 'boolean' ||
      !Array.isArray(item.languages) ||
      item.languages.length > 10 ||
      item.languages.some((lang) => !LANGUAGES.has(String(lang)))
    )
      return false;
    if (
      item.reason !== null &&
      item.reason !== undefined &&
      (typeof item.reason !== 'string' || item.reason.length > 500)
    )
      return false;
  }
  return true;
}

async function heartbeat(request: Request, env: Env, runner: Runner) {
  if (!runner.heartbeat_enabled)
    return json({ message: 'Heartbeat disabled for this runner' }, 403);
  let body: unknown;
  try {
    body = await boundedJson(request);
  } catch {
    return json({ message: 'Invalid heartbeat body' }, 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'capabilities')
  )
    return json({ message: 'Invalid heartbeat body' }, 400);
  const capabilities = (body as { capabilities?: unknown }).capabilities;
  if (capabilities !== undefined && !isCapabilities(capabilities))
    return json({ message: 'Invalid heartbeat body' }, 400);
  const now = new Date().toISOString();
  await query(env, `/rest/v1/devbox_runners?id=eq.${runner.id}`, 'private', {
    method: 'PATCH',
    body: JSON.stringify({
      ...(capabilities ? { capabilities } : {}),
      last_heartbeat_at: now,
      status: 'online',
      updated_at: now,
    }),
  });
  return json({ message: 'heartbeat accepted' });
}

async function poll(env: Env, runner: Runner) {
  const rows = await query<Record<string, unknown>[]>(
    env,
    '/rest/v1/rpc/claim_next_devbox_run',
    'private',
    {
      method: 'POST',
      body: JSON.stringify({ p_runner_id: runner.id }),
    }
  );
  const row = rows[0];
  if (!row) return json({ jobs: [] });
  if (
    typeof row.id !== 'string' ||
    typeof row.lease_id !== 'string' ||
    !Array.isArray(row.command)
  )
    throw new Error('Invalid claim result');
  return json({
    jobs: [
      {
        command: row.command,
        createdAt: row.created_at,
        env: row.env ?? {},
        envFiles: row.env_files ?? [],
        leaseId: row.lease_id,
        previewPorts: row.preview_ports ?? [],
        runId: row.id,
        timeoutSeconds: row.timeout_seconds,
        updatedAt: row.updated_at,
      },
    ],
  });
}

async function internalTokenMatches(request: Request, env: Env) {
  if (env.DEVBOX_CONTROL_INTERNAL_TOKEN.length < 32) return false;
  const actual = await digest(request.headers.get('Authorization') ?? '');
  const expected = await digest(`Bearer ${env.DEVBOX_CONTROL_INTERNAL_TOKEN}`);
  return actual === expected;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET')
      return json({ ok: true });
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_SECRET_KEY ||
      !env.DEVBOX_CONTROL_INTERNAL_TOKEN
    )
      return json({ message: 'Unavailable' }, 503);
    try {
      if (path === '/v1/notify' && request.method === 'POST') {
        if (!(await internalTokenMatches(request, env)))
          return json({ message: 'Unauthorized' }, 401);
        let body: unknown;
        try {
          body = await boundedJson(request);
        } catch {
          return json({ message: 'Invalid body' }, 400);
        }
        const runId = (body as { runId?: unknown } | null)?.runId;
        if (typeof runId !== 'string' || !UUID.test(runId))
          return json({ message: 'Invalid run ID' }, 400);
        const runs = await query<
          { runner_id: string | null; lease_id: string }[]
        >(
          env,
          `/rest/v1/devbox_runs?select=runner_id,lease_id&id=eq.${runId}&limit=1`,
          'private'
        );
        let runnerId = runs[0]?.runner_id;
        if (!runnerId && runs[0]?.lease_id && UUID.test(runs[0].lease_id)) {
          const leases = await query<{ runner_id: string | null }[]>(
            env,
            `/rest/v1/devbox_leases?select=runner_id&id=eq.${runs[0].lease_id}&limit=1`,
            'private'
          );
          runnerId = leases[0]?.runner_id;
        }
        if (runnerId && UUID.test(runnerId)) {
          await env.RUNNER_WAKE.getByName(runnerId).fetch(
            'https://wake.internal/',
            { method: 'POST' }
          );
        }
        return json({ notified: Boolean(runnerId) });
      }
      if (!['/v1/heartbeat', '/v1/poll', '/v1/connect'].includes(path))
        return json({ message: 'Not found' }, 404);
      const expectedMethod = path === '/v1/heartbeat' ? 'POST' : 'GET';
      if (request.method !== expectedMethod)
        return json({ message: 'Method not allowed' }, 405);
      const runner = await authorize(request, env, path !== '/v1/heartbeat');
      if (!runner) return json({ message: 'Unauthorized' }, 401);
      if (path === '/v1/heartbeat') return heartbeat(request, env, runner);
      if (path === '/v1/poll') return poll(env, runner);
      if (request.headers.get('Upgrade') !== 'websocket')
        return json({ message: 'Upgrade required' }, 426);
      return env.RUNNER_WAKE.getByName(runner.id).fetch(request);
    } catch {
      console.error('Devbox control request failed');
      return json({ message: 'Unavailable' }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
