import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { buildOutputCapture } from '../../../database/scripts/employee-web-session-build-diagnostic.mjs';

export function resolveNextCli(
  packageJson: string | URL = new URL('../../package.json', import.meta.url)
) {
  return createRequire(packageJson).resolve('next/dist/bin/next');
}

export const Config = z.strictObject({
  url: z.url(),
  key: z.string().min(1),
  anonKey: z.string().min(1),
  projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  basePort: z.number().int().min(12000).max(31999),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
});
export type SessionConfig = z.infer<typeof Config>;
export const rootId = '00000000-0000-0000-0000-000000000000';

export function fixtureClients(config: SessionConfig) {
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url: RequestInfo | URL, init?: RequestInit) =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        }),
    },
  };
  const admin = createClient(config.url, config.key, options);
  return {
    admin,
    anon: () => createClient(config.url, config.anonKey, options),
  };
}

export function sql(config: SessionConfig, statement: string) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      `supabase_db_${config.projectId}`,
      'psql',
      '-X',
      '-A',
      '-t',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      input: `set statement_timeout='8s'; set lock_timeout='2s';\n${statement}`,
      timeout: 10000,
      maxBuffer: 262144,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    }
  );
}

export async function ssrSession(
  config: SessionConfig,
  email: string,
  password: string,
  url: string
) {
  const cookies = new Map<string, string>();
  const client = createServerClient(url, config.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        for (const { name, value } of values) cookies.set(name, value);
      },
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        }),
    },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  assert.ok(!result.error && result.data.session);
  assert.ok(cookies.size > 0);
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

export type SessionPhase =
  | 'configuration'
  | 'build'
  | 'start'
  | 'cases'
  | 'cleanup'
  | 'complete';

class SessionProcessError extends Error {
  constructor(
    readonly exitCode: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly timedOut: boolean,
    readonly buildDiagnostic: ReturnType<
      ReturnType<typeof buildOutputCapture>['receipt']
    >
  ) {
    super('Session process failed');
  }
}

export function sessionFailure(error: unknown, phase: SessionPhase) {
  return {
    phase,
    ...(error instanceof SessionProcessError
      ? { buildDiagnostic: error.buildDiagnostic }
      : {}),
    kind:
      error instanceof SessionProcessError
        ? 'process'
        : error instanceof assert.AssertionError
          ? 'assertion'
          : error instanceof z.ZodError
            ? 'validation'
            : error instanceof Error && error.name === 'TimeoutError'
              ? 'timeout'
              : 'unknown',
    exitCode: error instanceof SessionProcessError ? error.exitCode : null,
    signal:
      error instanceof SessionProcessError
        ? error.signal === 'SIGTERM' || error.signal === 'SIGKILL'
          ? error.signal
          : error.signal === null
            ? null
            : 'other'
        : null,
    timedOut: error instanceof SessionProcessError && error.timedOut,
  };
}

function cleanupError(
  error: unknown
): 'not-running' | 'type-error' | 'timeout' | 'unknown' | null {
  if (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ERR_SERVER_NOT_RUNNING'
  )
    return 'not-running';
  if (error instanceof TypeError) return 'type-error';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  return 'unknown';
}

export async function sessionLifecycle(
  run: () => Promise<void>,
  phase: () => SessionPhase,
  stopServer: () => Promise<void>,
  closeProxy: () => Promise<void>
) {
  let failure: ReturnType<typeof sessionFailure> | null = null;
  try {
    await run();
  } catch (error) {
    failure = sessionFailure(error, phase());
  }
  const cleanup: {
    server: string;
    proxy: string;
    serverError: ReturnType<typeof cleanupError>;
    proxyError: ReturnType<typeof cleanupError>;
  } = {
    server: 'stopped',
    proxy: 'closed',
    serverError: null,
    proxyError: null,
  };
  try {
    await stopServer();
  } catch (error) {
    cleanup.server = 'failed';
    cleanup.serverError = cleanupError(error);
  }
  try {
    await closeProxy();
  } catch (error) {
    cleanup.proxy = 'failed';
    cleanup.proxyError = cleanupError(error);
  }
  if (!failure && (cleanup.server === 'failed' || cleanup.proxy === 'failed'))
    failure = sessionFailure(undefined, 'cleanup');
  return { failure, cleanup };
}

export async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  assert.ok(child.pid);
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* Already drained. */
    }
  }, 3000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}

export function command(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  capture = false
) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env,
    detached: false,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'ignore',
  });
}

export function webSessionBuildCommands() {
  return [
    [
      'turbo:local',
      'run',
      'build',
      '--filter=@tuturuuu/web^...',
      '--concurrency=1',
    ],
    ['run', '--cwd', 'apps/web', 'build'],
  ];
}

export async function build(env: NodeJS.ProcessEnv) {
  const deadline = Date.now() + 18 * 60_000;
  for (const args of webSessionBuildCommands()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new SessionProcessError(null, null, true, {
        diagnostics: [],
        truncated: false,
      });
    await completeBuild(command('bun', args, env, true), remaining);
  }
}

export async function completeBuild(
  child: ChildProcess,
  timeoutMs = 18 * 60_000
) {
  const capture = buildOutputCapture();
  child.stdout?.on('data', (chunk: Buffer) => capture.append('stdout', chunk));
  child.stderr?.on('data', (chunk: Buffer) => capture.append('stderr', chunk));
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void stop(child).catch(() => {});
  }, timeoutMs);
  let failed = false;
  try {
    const [code, signal] = await once(child, 'close');
    if (code !== 0 || signal !== null || timedOut)
      throw new SessionProcessError(code, signal, timedOut, capture.receipt());
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    clearTimeout(timer);
    capture.receipt();
    if (failed) await stop(child).catch(() => {});
    else await stop(child);
  }
}

// Forward every accepted request to the owned real GoTrue/PostgREST stack.
// Faults occur only after the real upstream has answered successfully.
export async function faultProxy(config: SessionConfig) {
  let hideTarget: string | null = null;
  let revokeActor: string | null = null;
  let faults = 0;
  let updates = 0;
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 262144) throw new Error('Request bound exceeded');
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (
          value &&
          ![
            'host',
            'connection',
            'content-length',
            'transfer-encoding',
          ].includes(name)
        )
          headers.set(name, Array.isArray(value) ? value.join(',') : value);
      }
      const pathname = request.url ?? '/';
      const body = Buffer.concat(chunks);
      const upstream = await fetch(`${config.url}${pathname}`, {
        method: request.method,
        headers,
        ...(body.length ? { body } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (
        request.method === 'PUT' &&
        pathname.startsWith('/auth/v1/admin/users/')
      )
        updates++;
      if (
        upstream.ok &&
        request.method === 'PUT' &&
        pathname === `/auth/v1/admin/users/${hideTarget}`
      ) {
        hideTarget = null;
        faults++;
        response.destroy();
        return;
      }
      if (
        upstream.ok &&
        pathname === '/rest/v1/rpc/mark_employee_restore_attempt' &&
        revokeActor
      ) {
        sql(
          config,
          `delete from public.workspace_members where ws_id='${rootId}' and user_id='${revokeActor}';`
        );
        revokeActor = null;
        faults++;
      }
      response.statusCode = upstream.status;
      for (const name of ['content-type', 'content-range']) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      response.end(bytes);
    } catch {
      response.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}`,
    hideProviderAck(id: string) {
      hideTarget = z.uuid().parse(id);
    },
    revokeBeforeProvider(id: string) {
      revokeActor = z.uuid().parse(id);
    },
    counts: () => ({ faults, updates }),
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
