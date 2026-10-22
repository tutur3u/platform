import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createPortServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createProfileRouteProgress } from '../../../database/scripts/employee-profile-route-receipt.mjs';
import {
  Config,
  command,
  completeBuild,
  resolveNextCli,
  type SessionConfig,
  type SessionPhase,
  sessionFailure,
  sessionLifecycle,
  stop,
} from '../../../web/e2e/fixtures/employee-web-session-support';
import {
  qualifyProfileRouteCases,
  RpcObservation,
} from './employee-profile-route-cases';

async function observeTransport(config: SessionConfig) {
  const observations: RpcObservation[] = [];
  let invalid = false;
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk);
        length += bytes.length;
        if (length > 262144) throw new Error('Request bound exceeded');
        chunks.push(bytes);
      }
      const body = Buffer.concat(chunks);
      const pathname = request.url ?? '/';
      if (pathname.startsWith('/rest/v1/rpc/') && request.method === 'POST') {
        const rpc = pathname.slice('/rest/v1/rpc/'.length);
        if (
          [
            'inspect_employee_profile',
            'update_employee_profile',
            'inspect_employee_profile_operation',
            'update_unmanaged_internal_profile',
            'inspect_unmanaged_internal_profile_operation',
          ].includes(rpc)
        ) {
          observations.push(
            RpcObservation.parse({
              rpc,
              tuple: JSON.parse(body.toString('utf8')),
            })
          );
          if (observations.length > 128)
            throw new Error('RPC observation bound exceeded');
        }
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
      const upstream = await fetch(`${config.url}${pathname}`, {
        method: request.method,
        headers,
        ...(body.length ? { body } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      response.statusCode = upstream.status;
      for (const name of ['content-type', 'content-range']) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      invalid = true;
      response.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}`,
    observations,
    assertValid() {
      assert.equal(invalid, false);
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}

let phase: SessionPhase = 'configuration';
let sourceSha = '0'.repeat(40);
const progress = createProfileRouteProgress();
let qualified = false;
let serverStopped = false;
let failure: ReturnType<typeof sessionFailure> | null = null;
let cleanup: Awaited<ReturnType<typeof sessionLifecycle>>['cleanup'] | null =
  null;
let startupOutput: Awaited<
  ReturnType<ReturnType<typeof command>['startupOutput']>
> | null = null;
let startup: {
  attempts: number;
  status: number | null;
  ready: boolean;
} | null = null;
async function main() {
  assert.ok(
    process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux'
  );
  assert.equal(process.env.EMPLOYEE_WEB_SESSION_PROCESS_GROUP, '1');
  const config = Config.parse(JSON.parse(readFileSync(0, 'utf8')));
  sourceSha = config.sourceSha;
  assert.equal(config.url, `http://127.0.0.1:${config.basePort + 1}`);
  const proxy = await observeTransport(config);
  let child: ReturnType<typeof command> | undefined;
  const result = await sessionLifecycle(
    async () => {
      const portServer = createPortServer();
      portServer.listen(0, '127.0.0.1');
      await once(portServer, 'listening');
      const address = portServer.address();
      assert.ok(address && typeof address !== 'string');
      const port = address.port;
      await new Promise<void>((resolve) => portServer.close(() => resolve()));
      const origin = `http://localhost:${port}`;
      const env = {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_SUPABASE_URL: proxy.url,
        SUPABASE_SERVER_URL: proxy.url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.anonKey,
        SUPABASE_SECRET_KEY: config.key,
        TUTURUUU_APP_COORDINATION_SECRET: randomBytes(48).toString('base64url'),
        NEXT_PUBLIC_APP_URL: origin,
      };
      phase = 'build';
      const deadline = Date.now() + 18 * 60000;
      for (const args of [
        [
          'turbo:local',
          'run',
          'build',
          '--filter=@tuturuuu/infrastructure^...',
          '--concurrency=1',
        ],
        ['run', '--cwd', 'apps/infrastructure', 'build'],
      ]) {
        const remaining = deadline - Date.now();
        assert.ok(remaining > 0);
        await completeBuild('bun', args, env, remaining);
      }
      phase = 'start';
      child = command(
        'node',
        [
          resolveNextCli(new URL('../../package.json', import.meta.url)),
          'start',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(port),
        ],
        env,
        fileURLToPath(new URL('../../', import.meta.url))
      );
      // PATCH exercises the deployed proxy and handler; GET's 405 is not readiness.
      const endpoint = `${origin}/api/v1/infrastructure/internal-accounts/${randomUUID()}`;
      startup = { attempts: 0, status: null, ready: false };
      let childError = false;
      const onError = () => {
        childError = true;
      };
      child.on('error', onError);
      try {
        for (let attempt = 0; attempt < 60; attempt++) {
          assert.ok(
            !childError && child.exitCode === null && child.signalCode === null
          );
          startup.attempts++;
          try {
            const response = await fetch(endpoint, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json', origin },
              body: JSON.stringify({
                action: 'update_profile',
                displayName: 'Readiness',
                username: 'hehe',
              }),
              redirect: 'error',
              signal: AbortSignal.timeout(1000),
            });
            startup.status = response.status;
            await response.body?.cancel();
            if (response.status === 401) {
              startup.ready = true;
              break;
            }
          } catch {
            /* Only bounded connection/readiness retries; no authenticated mutation retry. */
          }
          await delay(500);
        }
        assert.ok(
          startup.ready &&
            !childError &&
            child.exitCode === null &&
            child.signalCode === null
        );
      } finally {
        child.off('error', onError);
      }
      phase = 'cases';
      await qualifyProfileRouteCases({
        config,
        origin,
        observations: proxy.observations,
        checkpoint(value) {
          progress.checkpoint(value);
        },
      });
      proxy.assertValid();
    },
    () => phase,
    async () => {
      if (child) await stop(child);
    },
    () => proxy.close()
  );
  cleanup = result.cleanup;
  failure = result.failure;
  serverStopped = cleanup.server === 'stopped' && cleanup.proxy === 'closed';
  startupOutput = child ? await child.startupOutput() : null;
  if (failure) {
    phase = failure.phase;
    throw new Error('Profile route qualification failed');
  }
  phase = 'complete';
  qualified = true;
}
try {
  await main();
} catch (error) {
  failure ??= sessionFailure(error, phase);
  process.exitCode = 1;
}
console.log(
  JSON.stringify({
    version: 1,
    qualified,
    sourceSha,
    phase,
    ...progress.snapshot(),
    serverStopped,
    failure,
    cleanup,
    startup,
    startupOutput,
    routeAuthorizationProof: qualified,
    productionProof: false,
  })
);
