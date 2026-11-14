// App-owned fixture run by test:runtime.
import assert from 'node:assert/strict';
import {
  cp,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readFile,
  realpath,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(app, 'package.json'));
const ROOT = '00000000-0000-0000-0000-000000000000';
const origin = 'https://synthetic.supabase.invalid';
const fixtureKey = 'synthetic-server-key';
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const actor = (index) =>
  `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
const creator = actor(99);
const cases = [
  {
    name: 'member',
    id: actor(1),
    member: 'MEMBER',
    permission: true,
    status: 200,
  },
  {
    name: 'nonmember',
    id: actor(2),
    member: null,
    permission: true,
    status: 403,
  },
  {
    name: 'guest',
    id: actor(3),
    member: 'GUEST',
    permission: true,
    status: 403,
  },
  {
    name: 'missing-permission',
    id: actor(4),
    member: 'MEMBER',
    permission: false,
    status: 403,
  },
  {
    name: 'mfa-required',
    id: actor(5),
    member: 'MEMBER',
    permission: true,
    mfa: true,
    status: 403,
  },
];
const now = Math.floor(Date.now() / 1000);
const tokenFor = (entry) =>
  `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: entry.id,
    aud: 'authenticated',
    role: 'authenticated',
    exp: now + 3600,
    iat: now,
    aal: 'aal1',
  })}.c3ludGhldGlj`;
const tokens = new Map(cases.map((entry) => [tokenFor(entry), entry]));
const invalidToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
  sub: actor(98),
  exp: now + 3600,
})}.aW52YWxpZA`;
const eligible = cases[0];
const cookie = `sb-synthetic-auth-token=base64-${encode({
  access_token: tokenFor(eligible),
  refresh_token: 'synthetic-unused-refresh',
  token_type: 'bearer',
  expires_at: now + 3600,
  user: { id: eligible.id, app_metadata: {} },
})}`;

function policy(response, status, head = false) {
  assert.equal(response.status, status);
  assert.equal(response.cookies.length, 0, 'build-info must not write cookies');
  assert.equal(response.hstsFields, 1);
  assert.equal(
    response.headers['strict-transport-security'],
    'max-age=63072000'
  );
  assert.match(response.headers['cache-control'] ?? '', /\bno-store\b/u);
  assert.match(response.headers['content-type'] ?? '', /application\/json/u);
  assert.ok(response.headers['x-robots-tag']);
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.match(
    response.headers['content-security-policy'] ?? '',
    /frame-ancestors 'none'/u
  );
  if (head) assert.equal(response.body, '');
}

function call(
  workerOrigin,
  { method = 'GET', path = '/api/build-info', headers = {} }
) {
  const target = new URL(workerOrigin);
  return new Promise((resolve, reject) => {
    httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        method,
        path,
        headers: { host: 'infrastructure.tuturuuu.com', ...headers },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            cookies: response.headers['set-cookie'] ?? [],
            hstsFields: response.rawHeaders.filter(
              (name, index) =>
                index % 2 === 0 &&
                name.toLowerCase() === 'strict-transport-security'
            ).length,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    )
      .on('error', reject)
      .end();
  });
}

test(
  'sealed Infrastructure Worker enforces protected build identity',
  { timeout: 120000 },
  async (t) => {
    assert.equal(process.env.CI, 'true');
    const source = process.env.CI_SOURCE_SHA;
    assert.match(source ?? '', /^[a-f0-9]{40}$/u);
    const { configPath, config } = readNativeRuntimeConfig(app);
    assert.equal(config.no_bundle, true);
    for (const key of Object.keys(config.vars ?? {}))
      assert.equal(
        key.startsWith('PLATFORM_BUILD_'),
        false,
        'no runtime identity injection'
      );
    const scratch = await realpath(
      await mkdtemp(join(tmpdir(), 'infra-build-info-'))
    );
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await cp(join(app, 'dist'), join(scratch, 'dist'), {
      recursive: true,
      verbatimSymlinks: true,
    });
    const pointer = join(scratch, relative(app, configPath));
    const before = createHash('sha256')
      .update(await readFile(configPath))
      .digest('hex');
    const envFile = join(scratch, 'synthetic.env');
    const registry = join(scratch, 'registry');
    await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
    await mkdir(registry, { mode: 0o700 });
    const errors = [];
    const seen = [];
    let active = null;
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const outboundService = (request) => {
      try {
        const url = new URL(request.url);
        assert.equal(url.origin, origin);
        assert.equal(request.method, 'GET');
        seen.push({
          path: url.pathname,
          query: url.search,
          scenario: active?.name,
        });
        if (url.pathname === '/auth/v1/user') {
          assert.equal(url.search, '');
          const token = request.headers
            .get('authorization')
            ?.replace(/^Bearer /u, '');
          if (token === invalidToken)
            return json({ message: 'Invalid token' }, 401);
          const entry = tokens.get(token);
          assert.ok(entry, 'unregistered auth token');
          assert.ok(
            active?.id === entry.id || active?.cookieActor === entry.id,
            'actor mismatch'
          );
          return json({
            id: entry.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: `${entry.name}@example.invalid`,
            app_metadata: {
              tuturuuu_required_mfa: entry.mfa
                ? { required: true, verifiedAfter: now - 1 }
                : { required: false },
            },
            user_metadata: {},
          });
        }
        assert.equal(
          request.headers.get('authorization'),
          `Bearer ${fixtureKey}`
        );
        assert.equal(request.headers.get('apikey'), fixtureKey);
        assert.ok(active?.id);
        assert.equal(
          active.mfa,
          undefined,
          'MFA-required actor must not reach permissions'
        );
        const query = Object.fromEntries(url.searchParams);
        assert.equal(
          [...url.searchParams].length,
          Object.keys(query).length,
          'duplicate query key'
        );
        const same = (expected) => assert.deepEqual(query, expected);
        if (url.pathname === '/rest/v1/workspace_members') {
          same({
            select: 'type',
            ws_id: `eq.${ROOT}`,
            user_id: `eq.${active.id}`,
          });
          return json(active.member ? { type: active.member } : null);
        }
        if (url.pathname === '/rest/v1/workspaces') {
          same({ select: 'creator_id', id: `eq.${ROOT}` });
          return json({ creator_id: creator });
        }
        assert.ok(active.member, 'nonmember must not reach permission queries');
        if (url.pathname === '/rest/v1/workspace_role_members') {
          assert.equal(active.member, 'MEMBER');
          same({
            select:
              'workspace_roles!inner(workspace_role_permissions(permission))',
            user_id: `eq.${active.id}`,
            'workspace_roles.ws_id': `eq.${ROOT}`,
            'workspace_roles.workspace_role_permissions.ws_id': `eq.${ROOT}`,
            'workspace_roles.workspace_role_permissions.enabled': 'eq.true',
          });
          return json(
            active.permission
              ? [
                  {
                    workspace_roles: {
                      workspace_role_permissions: [
                        { permission: 'view_infrastructure' },
                      ],
                    },
                  },
                ]
              : []
          );
        }
        if (url.pathname === '/rest/v1/workspace_default_permissions') {
          same({
            select: 'permission',
            ws_id: `eq.${ROOT}`,
            member_type: `eq.${active.member}`,
            enabled: 'eq.true',
          });
          return json(
            active.member === 'GUEST' && active.permission
              ? [{ permission: 'view_infrastructure' }]
              : []
          );
        }
        throw new Error('Unallowlisted synthetic service path');
      } catch (error) {
        errors.push(String(error));
        return json({ error: 'fixture rejected unexpected request' }, 599);
      }
    };
    const values = {
      SUPABASE_SERVER_URL: origin,
      NEXT_PUBLIC_SUPABASE_URL: origin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_only',
      SUPABASE_SECRET_KEY: fixtureKey,
      INTERNAL_WEB_API_ORIGIN: 'https://central.invalid',
    };
    const worker = await require('wrangler').unstable_startWorker({
      config: pointer,
      envFiles: [envFile],
      sendMetrics: false,
      bindings: Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          { type: 'plain_text', value },
        ])
      ),
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        generateTypes: false,
        enableContainers: false,
        registry,
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider authentication forbidden');
        },
        outboundService,
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    const endpoint = (await worker.url).origin;
    const probe = async (entry, options, status) => {
      active = entry;
      const start = seen.length;
      const response = await call(endpoint, options);
      policy(response, status, options.method === 'HEAD');
      assert.deepEqual(errors, []);
      if (status === 200 && options.headers?.authorization)
        assert.ok(
          seen.slice(start).filter((entry) => entry.path === '/auth/v1/user')
            .length >= 2,
          'real MFA guard and route must both revalidate the bearer'
        );
      if (options.method !== 'HEAD') {
        const body = JSON.parse(response.body);
        if (status === 200) {
          assert.equal(body.appName, 'infrastructure');
          assert.equal(body.commitHash, source);
        } else {
          assert.equal(Object.hasOwn(body, 'appName'), false);
          assert.equal(Object.hasOwn(body, 'commitHash'), false);
        }
      }
      return response;
    };
    for (const method of ['GET', 'HEAD']) {
      await probe(null, { method }, 401);
      for (const entry of cases) {
        const response = await probe(
          entry,
          {
            method,
            headers: { authorization: `Bearer ${tokenFor(entry)}` },
          },
          entry.status
        );
        if (entry.mfa)
          assert.equal(
            response.headers['x-tuturuuu-auth-assurance'],
            'required'
          );
      }
    }
    await probe(eligible, { headers: { cookie } }, 200);
    // The Workers runtime drops an empty Authorization header before the
    // Worker sees it (pinned wrangler/workerd; Node unit tests still pin the
    // present-but-empty header to 401). Here it must behave exactly like an
    // absent header: anonymous is denied, and it is never a credential.
    await probe(null, { headers: { authorization: '' } }, 401);
    for (const authorization of [
      'Basic invalid',
      'Bearer  invalid',
      `Bearer ${invalidToken}`,
    ]) {
      await probe(
        { name: 'invalid-with-cookie', cookieActor: eligible.id },
        {
          headers: { authorization, cookie },
        },
        401
      );
    }
    for (const path of [
      '/api/build-info/neighbor',
      '/api/build-info-other',
      '/api/%62uild-info',
      '/api/build%2Dinfo',
    ]) {
      await probe(
        { name: 'invalid-path-credential' },
        {
          path,
          headers: { authorization: `Bearer ${invalidToken}` },
        },
        401
      );
    }
    active = eligible;
    const post = await call(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor(eligible)}` },
    });
    assert.equal(post.status, 405);
    assert.deepEqual(post.cookies, []);
    assert.deepEqual(errors, []);
    assert.ok(
      seen.some((entry) => entry.path === '/rest/v1/workspace_role_members')
    );
    assert.equal(
      createHash('sha256')
        .update(await readFile(configPath))
        .digest('hex'),
      before
    );
  }
);
