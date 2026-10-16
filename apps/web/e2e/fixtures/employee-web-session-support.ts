import assert from 'node:assert/strict';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

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
  env: NodeJS.ProcessEnv
) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env,
    detached: false,
    stdio: 'ignore',
  });
}

export async function build(env: NodeJS.ProcessEnv) {
  const child = command('bun', ['run', '--cwd', 'apps/web', 'build'], env);
  const timer = setTimeout(() => {
    void stop(child);
  }, 18 * 60_000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(code, 0);
    assert.equal(signal, null);
  } finally {
    clearTimeout(timer);
    await stop(child);
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
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}
