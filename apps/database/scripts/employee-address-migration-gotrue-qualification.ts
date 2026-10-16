import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { migrateEmployeeAddress } from '../../../packages/utils/src/internal-accounts/employee-address-migration';
import type { MigrationRecord } from '../../../packages/utils/src/internal-accounts/employee-address-migration-contract';
import { createEmployeeAddressMigrationProvider } from '../../../packages/utils/src/internal-accounts/employee-address-migration-provider';

// Invoke via the canonical resources-entry.ts run -- bun <this-file>.
// Real GoTrue/Auth only: the journal below is an explicit orchestration fixture,
// not qualification of the repository schema, triggers, ACLs or SQL journal.
const exec = promisify(execFile);
const suffix = randomUUID();
const network = `employee-gotrue-${suffix}`;
const database = `${network}-db`;
const auth = `${network}-auth`;
const label = `employee-gotrue-qualification=${suffix}`;
const secret = randomBytes(48).toString('hex');
const password = randomBytes(32).toString('hex');
const dbPassword = randomBytes(32).toString('hex');
const sourceAddress = 'qualification@staff.tuturuuu.com';
const destinationAddress = 'qualification@tuturuuu.com';
const deadline = Date.now() + 5 * 60_000;
let stage = 'preflight';
let failing = false;

async function docker(args: string[]) {
  try {
    return await exec('docker', args, {
      timeout: 30_000,
      maxBuffer: 256 * 1024,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'stderr' in error) {
      const diagnostic = String(error.stderr)
        .replaceAll(secret, '[redacted]')
        .replaceAll(password, '[redacted]')
        .replaceAll(dbPassword, '[redacted]');
      console.error(JSON.stringify({ dockerError: diagnostic.slice(0, 1500) }));
    }
    throw new Error('docker_operation_failed');
  }
}
async function sql(statement: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      'docker',
      [
        'exec',
        '-i',
        database,
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ],
      { timeout: 15_000, maxBuffer: 128 * 1024 },
      (error, stdout) => {
        if (error) reject(new Error('sql_operation_failed'));
        else resolve(stdout.trim());
      }
    );
    child.stdin?.end(statement);
  });
}
async function untilReady(check: () => Promise<boolean>) {
  const readinessDeadline = Math.min(deadline, Date.now() + 60_000);
  while (Date.now() < readinessDeadline) {
    try {
      if (await check()) return;
    } catch {
      /* bounded startup checks */
    }
    await sleep(500);
  }
  throw new Error('readiness_timeout');
}
function token() {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    role: 'service_role',
    aud: 'authenticated',
    iss: 'supabase',
    exp: Math.floor(Date.now() / 1000) + 900,
  })}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}
const SqlSnapshot = z.object({
  id: z.string(),
  encrypted_password: z.string(),
  raw_app_meta_data: z.unknown(),
  raw_user_meta_data: z.unknown(),
  banned_until: z.string().nullable(),
  email_confirmed_at: z.string().nullable(),
  identities: z.array(
    z.object({
      id: z.string(),
      provider_id: z.string(),
      user_id: z.string(),
      provider: z.string(),
      email_verified: z.boolean().nullable(),
    })
  ),
});
async function snapshot(userId: string) {
  assert.match(userId, /^[a-f0-9-]{36}$/);
  return SqlSnapshot.parse(
    JSON.parse(
      await sql(`select json_build_object(
    'id',u.id,'encrypted_password',u.encrypted_password,
    'raw_app_meta_data',u.raw_app_meta_data,'raw_user_meta_data',u.raw_user_meta_data,
    'banned_until',u.banned_until,'email_confirmed_at',u.email_confirmed_at,
    'identities',(select json_agg(json_build_object('id',i.id,'provider_id',i.provider_id,
      'user_id',i.user_id,'provider',i.provider,
      'email_verified',(i.identity_data->>'email_verified')::boolean) order by i.id)
      from auth.identities i where i.user_id=u.id))
    from auth.users u where u.id='${userId}';`)
    )
  );
}
function requireSdk<T>(
  response:
    | { data: T; error: null }
    | { data: unknown; error: { code?: string; status?: number } },
  operation: string
): T {
  if (response.error) {
    console.error(
      JSON.stringify({
        operation,
        rawCode: response.error.code ?? null,
        status: response.error.status ?? null,
      })
    );
    throw new Error('sdk_operation_failed');
  }
  return response.data;
}
async function inspectResource(
  kind: 'container' | 'network' | 'volume',
  name: string
) {
  try {
    const result = await exec('docker', [kind, 'inspect', name], {
      timeout: 30_000,
      maxBuffer: 256 * 1024,
    });
    return z
      .array(z.record(z.string(), z.unknown()))
      .length(1)
      .parse(JSON.parse(result.stdout))[0];
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'stderr' in error &&
      'code' in error
    ) {
      const diagnostic = String(error.stderr).trim();
      if (
        error.code === 1 &&
        [
          `Error: No such ${kind}: ${name}`,
          `Error response from daemon: No such ${kind}: ${name}`,
          ...(kind === 'network'
            ? [`Error response from daemon: network ${name} not found`]
            : []),
          `Error response from daemon: get ${name}: no such volume`,
        ].some(
          (message) =>
            diagnostic === message &&
            (kind === 'volume' || !message.endsWith('no such volume'))
        )
      )
        return null;
    }
    throw new Error('cleanup_inspect_unknown');
  }
}
const ResourceIdentity = z.object({
  Id: z.string().min(1),
  Labels: z.record(z.string(), z.string()).nullable(),
});
const ContainerIdentity = z.object({
  Id: z.string().min(1),
  Name: z.string(),
  Config: z.object({ Labels: z.record(z.string(), z.string()).nullable() }),
  Mounts: z.array(z.object({ Type: z.string(), Name: z.string().optional() })),
});
async function cleanup() {
  const volumes = new Set<string>();
  let verified = true;
  for (const name of [auth, database]) {
    try {
      const inspected = await inspectResource('container', name);
      if (inspected === null) continue;
      const container = ContainerIdentity.parse(inspected);
      assert.equal(container.Name, `/${name}`);
      assert.equal(
        container.Config.Labels?.['employee-gotrue-qualification'],
        suffix
      );
      for (const mount of container.Mounts) {
        if (mount.Type === 'volume') {
          assert.ok(mount.Name);
          volumes.add(mount.Name);
        }
      }
      await docker(['rm', '-f', '-v', container.Id]);
      assert.equal(await inspectResource('container', name), null);
    } catch {
      verified = false;
    }
  }
  try {
    const inspected = await inspectResource('network', network);
    if (inspected !== null) {
      const resource = ResourceIdentity.parse(inspected);
      assert.equal(resource.Labels?.['employee-gotrue-qualification'], suffix);
      await docker(['network', 'rm', resource.Id]);
    }
    assert.equal(await inspectResource('network', network), null);
  } catch {
    verified = false;
  }
  for (const volume of volumes) {
    try {
      assert.equal(await inspectResource('volume', volume), null);
    } catch {
      verified = false;
    }
  }
  console.log(
    JSON.stringify({
      cleanup: {
        containers: [auth, database],
        network,
        volumes: [...volumes],
        absent: verified,
      },
    })
  );
  if (!verified) failing = true;
}

try {
  for (const image of [
    'public.ecr.aws/supabase/postgres:17.11.0.004',
    'public.ecr.aws/supabase/gotrue:v2.197.0',
  ]) {
    await docker(['image', 'inspect', image]);
  }
  await docker(['network', 'create', '--internal', '--label', label, network]);
  stage = 'postgres_start';
  await docker([
    'run',
    '-d',
    '--pull=never',
    '--name',
    database,
    '--label',
    label,
    '--network',
    network,
    '--memory=512m',
    '--cpus=1',
    '--pids-limit=128',
    '--tmpfs',
    '/tmp/qualification:rw,mode=1777',
    '--user',
    'postgres',
    '--entrypoint',
    '/bin/sh',
    'public.ecr.aws/supabase/postgres:17.11.0.004',
    '-c',
    'initdb -D /tmp/qualification/data --auth=trust >/dev/null && echo "host all supabase_auth_admin 0.0.0.0/0 scram-sha-256" >> /tmp/qualification/data/pg_hba.conf && exec postgres -D /tmp/qualification/data -c listen_addresses=*',
  ]);
  await untilReady(async () => (await sql('select 1;')) === '1');
  await sql(`create schema auth; create role supabase_auth_admin login password '${dbPassword}' superuser;
    alter role supabase_auth_admin set search_path=auth,public;`);
  stage = 'gotrue_start';
  const environment: Record<string, string> = {
    GOTRUE_API_HOST: '0.0.0.0',
    GOTRUE_API_PORT: '9999',
    API_EXTERNAL_URL: 'http://127.0.0.1:9999',
    GOTRUE_SITE_URL: 'http://127.0.0.1:9999',
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_NAMESPACE: 'auth',
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${dbPassword}@${database}:5432/postgres?sslmode=disable`,
    GOTRUE_JWT_SECRET: secret,
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_DISABLE_SIGNUP: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'false',
    GOTRUE_LOG_LEVEL: 'error',
  };
  await docker([
    'run',
    '-d',
    '--pull=never',
    '--name',
    auth,
    '--label',
    label,
    '--network',
    network,
    '--memory=256m',
    '--cpus=1',
    '--pids-limit=128',
    ...Object.entries(environment).flatMap(([key, value]) => [
      '-e',
      `${key}=${value}`,
    ]),
    'public.ecr.aws/supabase/gotrue:v2.197.0',
  ]);
  const url = `http://${auth}:9999`;
  // Docker Desktop internal networks cannot publish ports. Route real SDK HTTP
  // through curl inside our disposable DB container; no host or external socket.
  let adminUserPuts = 0;
  async function isolatedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const target = String(input).replace(`${url}/auth/v1`, url);
    assert.ok(target.startsWith(`${url}/`));
    if (init?.method === 'PUT' && target.includes('/admin/users/'))
      adminUserPuts++;
    const config = [
      `url = ${JSON.stringify(target)}`,
      `request = ${JSON.stringify(init?.method ?? 'GET')}`,
      'silent',
      'show-error',
      'max-time = 10',
      ...Array.from(new Headers(init?.headers)).map(
        ([key, value]) => `header = ${JSON.stringify(`${key}: ${value}`)}`
      ),
      ...(init?.body ? [`data = ${JSON.stringify(String(init.body))}`] : []),
    ].join('\n');
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        'docker',
        [
          'exec',
          '-i',
          database,
          'curl',
          '--config',
          '-',
          '--write-out',
          '\n%{http_code}',
        ],
        { timeout: 15000, maxBuffer: 128 * 1024 },
        (error, stdout) => {
          if (error) reject(new Error('isolated_http_failed'));
          else resolve(stdout);
        }
      );
      child.stdin?.end(config);
    });
    const split = output.lastIndexOf('\n');
    return new Response(output.slice(0, split), {
      status: Number(output.slice(split + 1)),
    });
  }
  await untilReady(async () => (await isolatedFetch(`${url}/health`)).ok);
  const client = createClient(url, token(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: isolatedFetch },
  });
  stage = 'fixture_create';
  const created = requireSdk(
    await client.auth.admin.createUser({
      email: sourceAddress,
      password,
      email_confirm: true,
      user_metadata: { qualification: 'preserve-user' },
      app_metadata: { qualification: 'preserve-app' },
    }),
    'fixture_create_email_confirm_true'
  );
  assert.ok(created.user);
  const userId = created.user.id;
  const createdSnapshot = await snapshot(userId);
  const calls: {
    keys: string[];
    code: string | null;
    status: number | null;
  }[] = [];
  const provider = createEmployeeAddressMigrationProvider({
    binding: { userId, sourceAddress, destinationAddress },
    authorize: async () => true,
    admin: {
      getUserById: (id) => client.auth.admin.getUserById(id),
      async updateUserById(id, attributes) {
        assert.deepEqual(Object.keys(attributes), ['email']);
        const response = await client.auth.admin.updateUserById(id, attributes);
        calls.push({
          keys: Object.keys(attributes),
          code: response.error?.code ?? null,
          status: response.error?.status ?? null,
        });
        return response;
      },
    },
  });
  stage = 'provider_baseline';
  const createdBaseline = await provider.read(userId);
  console.log(
    JSON.stringify({
      stage: 'created_source_precondition',
      emailConfirm: true,
      emailVerified: createdBaseline.emailVerified,
      identityEmailVerified: createdSnapshot.identities.map(
        (i) => i.email_verified
      ),
      preconditionMet: createdBaseline.emailVerified,
    })
  );
  stage = 'source_magiclink_verification';
  const link = requireSdk(
    await client.auth.admin.generateLink({
      type: 'magiclink',
      email: sourceAddress,
    }),
    'source_generate_magiclink'
  );
  assert.ok(link.properties.hashed_token);
  const verified = requireSdk(
    await client.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: 'magiclink',
    }),
    'source_verify_magiclink'
  );
  assert.equal(verified.user?.id, userId);
  const before = await snapshot(userId);
  const initial = await provider.read(userId);
  console.log(
    JSON.stringify({
      fixtureCreate: { emailConfirm: true },
      baseline: {
        emailVerified: initial.emailVerified,
        active: initial.active,
        confirmedAt: before.email_confirmed_at,
        identities: before.identities,
        sdkIdentities: verified.user?.identities?.map((identity) => ({
          id: identity.id,
          identity_id: identity.identity_id,
          provider: identity.provider,
          user_id: identity.user_id,
          email_verified: identity.identity_data?.email_verified,
        })),
      },
      fullSchemaQualified: false,
    })
  );
  assert.equal(adminUserPuts, 0);
  if (!initial.emailVerified) {
    stage = 'source_unverified_negative_qualification';
    await assert.rejects(provider.changeEmail(userId, destinationAddress));
    assert.equal(calls.length, 0);
    assert.equal(adminUserPuts, 0);
    assert.deepEqual(await snapshot(userId), before);
    const unchanged = requireSdk(
      await client.auth.admin.getUserById(userId),
      'negative_readback'
    );
    assert.equal(unchanged.user.email, sourceAddress);
    console.log(
      JSON.stringify({
        stage,
        qualification: 'PASS',
        outcome: 'SOURCE_UNVERIFIED',
        supportedVerification: 'magiclink_otp_accepted',
        migrationInvoked: false,
        migrationPuts: adminUserPuts,
        supplierRefused: true,
        fullSchemaQualified: false,
      })
    );
  } else {
    assert.equal(initial.emailVerified, true);
    assert.equal(initial.active, true);
    const request = {
      userId,
      sourceAddress,
      destinationAddress,
      actorId: randomUUID(),
      operationId: randomUUID(),
      expectedRevision: 0,
    };
    let record: MigrationRecord | null = null;
    let completes = 0;
    stage = 'actual_email_only_migration';
    const result = await migrateEmployeeAddress(
      {
        provider,
        newAttemptId: randomUUID,
        journal: {
          async inspect() {
            return {
              authorized: true,
              revision: 0,
              immutableFingerprint: 'a'.repeat(64),
              providerIdentityFingerprint: initial.providerIdentityFingerprint,
              sourceVerified: true,
              addressOwnership: 'same_identity',
              record,
            };
          },
          async reserve(binding) {
            record = { binding, phase: 'reserved', attemptId: null };
          },
          async claimAttempt(binding, attemptId) {
            record = { binding, phase: 'attempted', attemptId };
            return true;
          },
          async complete() {
            completes++;
            throw new Error('unexpected_complete');
          },
        },
      },
      request
    );
    const afterSdk = requireSdk(
      await client.auth.admin.getUserById(userId),
      'after_getUserById'
    );
    assert.ok(afterSdk.user);
    const after = await snapshot(userId);
    const observation = await provider.read(userId);
    console.log(
      JSON.stringify({
        fixtureCreate: { emailConfirm: true },
        migrationCalls: calls,
        before: {
          emailVerified: initial.emailVerified,
          identities: before.identities,
          confirmedAt: before.email_confirmed_at,
        },
        after: {
          emailVerified: observation.emailVerified,
          identities: after.identities,
          confirmedAt: after.email_confirmed_at,
        },
        result,
        journal: 'fixture-only',
        fullSchemaQualified: false,
      })
    );
    stage = 'invariants';
    assert.equal(calls.length, 1);
    assert.equal(adminUserPuts, 1);
    assert.deepEqual(calls[0], { keys: ['email'], code: null, status: null });
    assert.equal(afterSdk.user.email, destinationAddress);
    assert.equal(after.id, before.id);
    assert.equal(after.encrypted_password, before.encrypted_password);
    assert.deepEqual(after.raw_app_meta_data, before.raw_app_meta_data);
    assert.deepEqual(after.raw_user_meta_data, before.raw_user_meta_data);
    assert.equal(after.banned_until, before.banned_until);
    assert.equal(after.email_confirmed_at, before.email_confirmed_at);
    const keys = (value: z.infer<typeof SqlSnapshot>) =>
      value.identities.map(({ id, provider_id, user_id, provider }) => ({
        id,
        provider_id,
        user_id,
        provider,
      }));
    assert.deepEqual(keys(after), keys(before));
    assert.equal(
      observation.providerIdentityFingerprint,
      initial.providerIdentityFingerprint
    );
    assert.equal(observation.emailVerified, false);
    assert.equal(after.identities[0]?.email_verified, false);
    assert.deepEqual(result, {
      status: 'pending',
      operationId: request.operationId,
      nextAction: 'inspect',
    });
    assert.equal(completes, 0);
    await assert.rejects(provider.changeEmail(userId, destinationAddress));
    assert.equal(calls.length, 1);
    console.log(
      JSON.stringify({
        stage,
        qualification: 'PASS',
        outcome: 'DESTINATION_UNVERIFIED_PENDING',
        migrationPuts: adminUserPuts,
        preserved: [
          'uuid',
          'identities',
          'password',
          'metadata',
          'ban',
          'confirmedAt',
        ],
        fullSchemaQualified: false,
      })
    );
  }
} catch (error) {
  failing = true;
  // Assertions may contain password hashes: never print error message/actual/expected.
  console.error(
    JSON.stringify({
      stage,
      failure: error instanceof Error ? error.name : 'unknown',
      code:
        error instanceof Error && /^[a-z_]+$/.test(error.message)
          ? error.message
          : 'assertion_or_provider_failure',
    })
  );
} finally {
  try {
    await cleanup();
  } catch {
    failing = true;
    console.error('cleanup_verification_failed');
  }
}
process.exitCode = failing ? 1 : 0;
