import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { createAppSessionToken } from '@tuturuuu/auth/app-session-core';
import { z } from 'zod';
import {
  build,
  Config,
  command,
  faultProxy,
  fixtureClients,
  rootId,
  sql,
  ssrSession,
  stop,
} from './employee-web-session-support';

let phase = 'configuration';
let sourceSha = '0'.repeat(40);
let assertions = 0;
let serverStopped = false;
const cases: string[] = [];
function check(value: unknown) {
  assert.ok(value);
  assertions++;
}
const ObjectReply = z
  .object({ code: z.string().optional(), status: z.string().optional() })
  .passthrough();

async function main() {
  check(process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux');
  check(process.env.EMPLOYEE_WEB_SESSION_PROCESS_GROUP === '1');
  const config = Config.parse(JSON.parse(readFileSync(0, 'utf8')));
  sourceSha = config.sourceSha;
  check(config.url === `http://127.0.0.1:${config.basePort + 1}`);
  const proxy = await faultProxy(config);
  let child: ReturnType<typeof command> | undefined;
  try {
    const portServer = createServer();
    portServer.listen(0, '127.0.0.1');
    await once(portServer, 'listening');
    const address = portServer.address();
    assert.ok(address && typeof address !== 'string');
    const port = address.port;
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const secret = randomBytes(48).toString('base64url');
    // Only this child receives activation flags and disposable credentials.
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: proxy.url,
      SUPABASE_SERVER_URL: proxy.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.anonKey,
      SUPABASE_SECRET_KEY: config.key,
      TUTURUUU_APP_COORDINATION_SECRET: secret,
      NEXT_PUBLIC_APP_URL: origin,
      EMPLOYEE_CREATION_RUNTIME_ENABLED: 'true',
      EMPLOYEE_RESTORATION_RUNTIME_ENABLED: 'true',
    };
    phase = 'build';
    await build(env);
    phase = 'start';
    child = command(
      'node',
      [
        path.resolve('node_modules/next/dist/bin/next'),
        'start',
        'apps/web',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      env
    );
    const endpoint = `${origin}/api/v1/infrastructure/internal-accounts/employees`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        const response = await fetch(endpoint, {
          redirect: 'error',
          signal: AbortSignal.timeout(1000),
        });
        await response.arrayBuffer();
        if (response.status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* Startup has a finite deadline. */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    check(ready);
    phase = 'cases';
    const { admin, anon } = fixtureClients(config);
    const password = randomBytes(24).toString('base64url');
    async function identity(domain = 'tuturuuu.com') {
      const result = await admin.auth.admin.createUser({
        email: `web-session-${randomUUID()}@${domain}`,
        password,
        email_confirm: true,
      });
      check(!result.error && result.data.user);
      return z
        .object({ id: z.uuid(), email: z.email() })
        .parse(result.data.user);
    }
    async function session(email: string) {
      const client = anon();
      const result = await client.auth.signInWithPassword({ email, password });
      check(!result.error && result.data.session);
      return {
        client,
        token: z.string().min(1).parse(result.data.session?.access_token),
      };
    }
    const actor = await identity();
    sql(
      config,
      `begin;
insert into public.workspaces(id,name,creator_id,personal) values('${rootId}','Web session fixture','${actor.id}',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type) values('${rootId}','${actor.id}','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
delete from public.workspace_default_permissions where ws_id='${rootId}';
insert into private.mail_domains(domain,status) values('tuturuuu.com','active') on conflict(domain) do update set status='active';
commit;`
    );
    const actorSession = await session(actor.email);
    const bearer = { authorization: `Bearer ${actorSession.token}` };
    const cookie = {
      cookie: await ssrSession(config, actor.email, password, proxy.url),
    };
    const app = (targetApp = 'infra', expiresInSeconds = 300) =>
      createAppSessionToken(
        {
          userId: actor.id,
          email: actor.email,
          targetApp,
          expiresInSeconds,
        },
        { secret }
      ).token;
    const satellite = { cookie: `tuturuuu_app_session=${app()}` };
    const dummy = randomUUID();
    async function request(
      url: string,
      headers: Record<string, string>,
      body?: object
    ) {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tuturuuu-account-action': '1',
          origin,
          'sec-fetch-site': 'same-origin',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const value = ObjectReply.parse(await response.json());
      check(response.headers.get('cache-control')?.includes('no-store'));
      return { response, value };
    }
    async function denied(
      name: string,
      headers: Record<string, string>,
      status: number,
      code: string
    ) {
      const result = await request(`${endpoint}/${dummy}/restore`, headers, {});
      check(result.response.status === status && result.value.code === code);
      cases.push(name);
    }
    async function allowed(name: string, headers: Record<string, string>) {
      const result = await request(endpoint, headers);
      check(result.response.status === 200 && result.value.available === true);
      cases.push(name);
    }
    await denied('anonymous', {}, 401, 'unauthorized');
    await denied(
      'malformed-bearer',
      { ...cookie, authorization: 'Bearer invalid' },
      401,
      'unauthorized'
    );
    await allowed('bearer-session', bearer);
    await allowed('ssr-cookie', cookie);
    await allowed('satellite-cookie', satellite);
    await denied(
      'wrong-app',
      { cookie: `tuturuuu_app_session=${app('mail')}` },
      401,
      'unauthorized'
    );
    await denied(
      'expired-app',
      {
        cookie: `tuturuuu_app_session=${
          createAppSessionToken(
            {
              userId: actor.id,
              email: actor.email,
              targetApp: 'infra',
              expiresInSeconds: 1,
            },
            { secret, now: new Date(Date.now() - 60000) }
          ).token
        }`,
      },
      401,
      'unauthorized'
    );
    const validApp = app();
    await denied(
      'tampered-app',
      { cookie: `tuturuuu_app_session=${validApp.slice(0, -8)}invalid0` },
      401,
      'unauthorized'
    );
    const foreign = await identity('example.test');
    sql(
      config,
      `insert into public.workspace_members(ws_id,user_id,type) values('${rootId}','${foreign.id}','MEMBER');
insert into public.workspace_default_permissions(ws_id,member_type,permission,enabled) values('${rootId}','MEMBER','manage_internal_accounts',true);`
    );
    await denied(
      'canonical-domain',
      { authorization: `Bearer ${(await session(foreign.email)).token}` },
      403,
      'forbidden'
    );
    sql(
      config,
      `delete from public.workspace_default_permissions where ws_id='${rootId}';`
    );
    const member = await identity();
    const memberSession = await session(member.email);
    const memberBearer = { authorization: `Bearer ${memberSession.token}` };
    await denied('non-root', memberBearer, 403, 'forbidden');
    sql(
      config,
      `insert into public.workspace_members(ws_id,user_id,type) values('${rootId}','${member.id}','MEMBER');
insert into public.workspace_default_permissions(ws_id,member_type,permission,enabled) values('${rootId}','MEMBER','manage_internal_accounts',true);`
    );
    const permissionGranted = await request(endpoint, memberBearer);
    check(
      permissionGranted.response.status === 200 &&
        permissionGranted.value.available === true
    );
    sql(
      config,
      `update public.workspace_default_permissions set enabled=false where ws_id='${rootId}' and permission='manage_internal_accounts';`
    );
    await denied('permission-revoked', memberBearer, 403, 'forbidden');
    sql(
      config,
      `delete from public.workspace_members where ws_id='${rootId}' and user_id='${actor.id}';`
    );
    await denied('membership-revoked', satellite, 403, 'forbidden');
    sql(
      config,
      `insert into public.workspace_members(ws_id,user_id,type) values('${rootId}','${actor.id}','MEMBER');`
    );
    check(
      !(
        await admin.auth.admin.updateUserById(actor.id, { ban_duration: '24h' })
      ).error
    );
    await denied('inactive-actor', satellite, 403, 'forbidden');
    check(
      !(
        await admin.auth.admin.updateUserById(actor.id, {
          ban_duration: 'none',
        })
      ).error
    );
    check(!(await actorSession.client.auth.signOut({ scope: 'global' })).error);
    await denied('session-revoked', bearer, 401, 'unauthorized');
    await denied(
      'origin',
      { ...satellite, origin: 'https://foreign.example.test' },
      403,
      'forbidden'
    );
    await denied(
      'fetch-site',
      { ...satellite, 'sec-fetch-site': 'cross-site' },
      403,
      'forbidden'
    );
    await denied(
      'action-header',
      { ...satellite, 'x-tuturuuu-account-action': '' },
      403,
      'forbidden'
    );
    const self = await request(`${endpoint}/${actor.id}/restore`, satellite, {
      confirmationEmail: actor.email,
      expectedRevision: 0,
    });
    check(
      self.response.status === 409 && self.value.code === 'employee_self_action'
    );
    cases.push('self-action');
    async function createTarget() {
      const email = `web-target-${randomUUID()}@tuturuuu.com`;
      const result = await request(
        endpoint,
        { ...satellite, 'idempotency-key': randomUUID() },
        {
          email,
          displayName: 'Web Session Employee',
          temporaryPassword: password,
        }
      );
      check(
        result.response.status === 201 && result.value.status === 'created'
      );
      const parsed = z
        .object({
          account: z.object({ id: z.uuid(), email: z.literal(email) }),
        })
        .parse(result.value);
      const id = parsed.account.id;
      const provider = await admin.auth.admin.getUserById(id);
      check(
        !provider.error &&
          provider.data.user?.email === email &&
          Boolean(provider.data.user.email_confirmed_at)
      );
      check(
        !(await admin.auth.admin.updateUserById(id, { ban_duration: '24h' }))
          .error
      );
      return { id, email };
    }
    const target = await createTarget();
    cases.push('create');
    const payload = { confirmationEmail: target.email, expectedRevision: 0 };
    const restored = await request(
      `${endpoint}/${target.id}/restore`,
      satellite,
      payload
    );
    check(
      restored.response.status === 200 &&
        restored.value.status === 'restored' &&
        restored.value.revision === 1
    );
    const operationId = z.uuid().parse(restored.value.operationId);
    const provider = await admin.auth.admin.getUserById(target.id);
    check(
      !provider.error &&
        (!provider.data.user.banned_until ||
          Date.parse(provider.data.user.banned_until) <= Date.now())
    );
    cases.push('restore');
    const beforeReplay = proxy.counts().updates;
    const replay = await request(
      `${endpoint}/${target.id}/reconcile`,
      satellite,
      { ...payload, operationId }
    );
    check(
      replay.response.status === 200 &&
        replay.value.status === 'restored' &&
        replay.value.operationId === operationId
    );
    check(proxy.counts().updates === beforeReplay);
    cases.push('restore-replay');
    const unknown = await createTarget();
    const beforeUnknown = proxy.counts();
    proxy.hideProviderAck(unknown.id);
    const pending = await request(
      `${endpoint}/${unknown.id}/restore`,
      satellite,
      { confirmationEmail: unknown.email, expectedRevision: 0 }
    );
    check(
      pending.response.status === 202 &&
        pending.value.status === 'pending' &&
        pending.value.nextAction === 'inspect'
    );
    const pendingId = z.uuid().parse(pending.value.operationId);
    check(
      proxy.counts().faults === beforeUnknown.faults + 1 &&
        proxy.counts().updates === beforeUnknown.updates + 1
    );
    cases.push('lost-provider-ack');
    const reconciled = await request(
      `${endpoint}/${unknown.id}/reconcile`,
      satellite,
      {
        confirmationEmail: unknown.email,
        expectedRevision: 0,
        operationId: pendingId,
      }
    );
    check(
      reconciled.response.status === 200 &&
        reconciled.value.status === 'restored' &&
        reconciled.value.operationId === pendingId
    );
    check(proxy.counts().updates === beforeUnknown.updates + 1);
    cases.push('unknown-reconcile');
    const revoked = await createTarget();
    const beforeRevoked = proxy.counts();
    proxy.revokeBeforeProvider(actor.id);
    const stopped = await request(
      `${endpoint}/${revoked.id}/restore`,
      satellite,
      { confirmationEmail: revoked.email, expectedRevision: 0 }
    );
    check(stopped.response.status === 403 || stopped.response.status === 202);
    check(
      proxy.counts().faults === beforeRevoked.faults + 1 &&
        proxy.counts().updates === beforeRevoked.updates
    );
    const stillBanned = await admin.auth.admin.getUserById(revoked.id);
    check(
      !stillBanned.error &&
        Date.parse(stillBanned.data.user.banned_until ?? '') > Date.now()
    );
    cases.push('revoked-before-provider');
  } finally {
    const priorPhase = phase;
    phase = 'cleanup';
    if (child) await stop(child);
    await proxy.close();
    serverStopped = true;
    phase = priorPhase;
  }
  phase = 'complete';
}

try {
  await main();
  console.log(
    JSON.stringify({
      qualified: true,
      phase,
      sourceSha,
      assertions,
      cases,
      serverStopped,
      productionProof: false,
      routeAuthorizationProof: true,
    })
  );
} catch {
  console.log(
    JSON.stringify({
      qualified: false,
      phase,
      sourceSha,
      assertions,
      cases,
      serverStopped,
      productionProof: false,
      routeAuthorizationProof: false,
    })
  );
  process.exitCode = 1;
}
