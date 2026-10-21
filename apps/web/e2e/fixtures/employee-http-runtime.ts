import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { EmployeeCreationReplySchema } from '../../../../packages/internal-api/src/infrastructure/employee-creation';
import { createEmployeeCreationJournal } from '../../src/lib/infrastructure/employee-creation-journal';
import { createEmployeeCreationOperationStore } from '../../src/lib/infrastructure/employee-creation-operation-store';
import { createEmployeeRuntimeRpc } from '../../src/lib/infrastructure/employee-creation-rpc';
import { createEmployeeRpcPhaseProvider } from '../../src/lib/infrastructure/employee-creation-rpc-provider';
import { qualifyEmployeeRejectionHttp } from './employee-rejection-http-runtime';
import { qualifyEmployeeRestoreHttp } from './employee-restore-http-runtime';

const JournalResultSchema = z.strictObject({
  targetUserId: z.uuid(),
  outcome: EmployeeCreationReplySchema,
});
async function claimAndRun(
  journal: ReturnType<typeof createEmployeeCreationJournal>,
  input: Parameters<
    ReturnType<typeof createEmployeeCreationJournal>['claimAndRun']
  >[0]
) {
  return JournalResultSchema.parse(await journal.claimAndRun(input));
}

// This fixture never consumes a deployed project's configuration or credentials.
const Config = z.strictObject({
  url: z.url(),
  key: z.string().min(1),
  anonKey: z.string().min(1),
  projectId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  basePort: z.number().int().min(12000).max(31999),
  includeRestore: z.boolean().default(false),
});
let phase = 'configuration';
let assertions = 0;
let restoreQualification: Awaited<
  ReturnType<typeof qualifyEmployeeRestoreHttp>
> | null = null;
function check(value: unknown) {
  assert.ok(value);
  assertions++;
}
async function main() {
  check(process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux');
  const config = Config.parse(JSON.parse(readFileSync(0, 'utf8')));
  const url = new URL(config.url);
  check(
    url.origin === `http://127.0.0.1:${config.basePort + 1}` &&
      url.pathname === '/'
  );
  check(!url.username && !url.password && !url.search && !url.hash);
  const admin = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const transport = createEmployeeRuntimeRpc({
    url: config.url,
    key: config.key,
  });
  const password = `Aa1!${randomBytes(24).toString('base64url')}`;
  phase = 'disposable-administrator';
  const actor = await admin.auth.admin.createUser({
    email: `http-admin-${randomUUID()}@tuturuuu.com`,
    password,
    email_confirm: true,
  });
  check(!actor.error && actor.data.user);
  const actorId = z.uuid().parse(actor.data.user?.id);
  // SQL sets fixture-only workspace/domain data, never provider password/ban/confirmation.
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      `supabase_db_${config.projectId}`,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      input: `begin;
insert into public.workspaces(id,name,creator_id,personal)
values('00000000-0000-0000-0000-000000000000','HTTP fixture','${actorId}',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type)
values('00000000-0000-0000-0000-000000000000','${actorId}','MEMBER')
on conflict(ws_id,user_id) do update set type='MEMBER';
insert into private.mail_domains(domain,status) values('tuturuuu.com','active')
on conflict(domain) do update set status='active';
commit;`,
      timeout: 10000,
      maxBuffer: 262144,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  phase = 'effective-rpc-permissions';
  check((await transport.ready(actorId)).ready);
  await assert.rejects(
    createEmployeeRuntimeRpc({ url: config.url, key: config.anonKey }).ready(
      actorId
    )
  );
  assertions++;
  await assert.rejects(transport.ready(randomUUID()));
  assertions++;
  let creates = 0;
  let activations = 0;
  const auth = {
    getUserById: admin.auth.admin.getUserById.bind(admin.auth.admin),
    async createUser(input: Parameters<typeof admin.auth.admin.createUser>[0]) {
      creates++;
      return admin.auth.admin.createUser(input);
    },
    async updateUserById(
      ...args: Parameters<typeof admin.auth.admin.updateUserById>
    ) {
      activations++;
      return admin.auth.admin.updateUserById(...args);
    },
  };
  async function authorize(id: string) {
    if (id !== actorId) return false;
    try {
      return (await transport.ready(id)).ready;
    } catch {
      return false;
    }
  }
  const actorProof: Parameters<
    typeof createEmployeeCreationOperationStore
  >[0]['authorize'] = async (id) => {
    if (!(await authorize(id))) return null;
    const user = await admin.auth.admin.getUserById(id);
    if (user.error) return null;
    const now = Date.now();
    return {
      actorUserId: id,
      workspaceId: '00000000-0000-0000-0000-000000000000',
      membership: 'MEMBER',
      permission: 'manage_internal_accounts',
      email: user.data.user.email,
      emailConfirmed: Boolean(user.data.user.email_confirmed_at),
      unbanned:
        !user.data.user.banned_until ||
        Date.parse(user.data.user.banned_until) <= now,
      observedAt: now,
      expiresAt: now + 60000,
    };
  };
  const store = createEmployeeCreationOperationStore({
    rpc: transport.rpc,
    authorize: actorProof,
  });
  const journal = createEmployeeCreationJournal({
    store,
    provider: createEmployeeRpcPhaseProvider({ transport, auth, authorize }),
  });
  phase = 'journal-create';
  check(await journal.available(actorId));
  const input = {
    actorUserId: actorId,
    operationId: randomUUID(),
    payload: {
      email: `http-employee-${randomUUID()}@tuturuuu.com`,
      displayName: 'HTTP Employee',
      temporaryPassword: password,
    },
  };
  const result = await claimAndRun(journal, input);
  check(result.outcome.status === 'created');
  check(creates === 1 && activations === 1);
  phase = 'independent-state';
  const observed = await transport.inspect(actorId, input.operationId);
  check(observed.operation?.phase === 'active');
  check(observed.operation?.targetUserId === result.targetUserId);
  check(
    observed.account?.id === result.targetUserId &&
      observed.account?.email === input.payload.email
  );
  const provider = await admin.auth.admin.getUserById(result.targetUserId);
  check(!provider.error && provider.data.user?.email === input.payload.email);
  check(
    provider.data.user?.email_confirmed_at &&
      (!provider.data.user.banned_until ||
        Date.parse(provider.data.user.banned_until) <= Date.now())
  );
  phase = 'replay-and-conflict';
  const replay = await claimAndRun(journal, input);
  check(
    replay.outcome.status === 'created' &&
      replay.targetUserId === result.targetUserId
  );
  const conflict = await claimAndRun(journal, {
    ...input,
    payload: { ...input.payload, displayName: 'Different Name' },
  });
  check(conflict.outcome.status === 'conflict');
  check(creates === 1 && activations === 1);
  phase = 'lost-claim-acknowledgement';
  const lostInput = {
    ...input,
    operationId: randomUUID(),
    payload: {
      ...input.payload,
      email: `http-lost-claim-${randomUUID()}@tuturuuu.com`,
    },
  };
  let hideClaim = true;
  const lostTransport = createEmployeeRuntimeRpc({
    url: config.url,
    key: config.key,
    async fetch(url, options) {
      const response = await fetch(url, options);
      if (
        hideClaim &&
        String(url).endsWith('/employee_creation_operation_claim')
      ) {
        hideClaim = false;
        await response.text();
        throw new Error('Synthetic lost committed claim acknowledgement');
      }
      return response;
    },
  });
  const lostStore = createEmployeeCreationOperationStore({
    rpc: lostTransport.rpc,
    authorize: actorProof,
  });
  const lostJournal = createEmployeeCreationJournal({
    store: lostStore,
    provider: createEmployeeRpcPhaseProvider({
      transport: lostTransport,
      auth,
      authorize,
    }),
  });
  await assert.rejects(lostJournal.claimAndRun(lostInput));
  assertions++;
  const reserved = await transport.inspect(actorId, lostInput.operationId);
  check(reserved.operation?.phase === 'reserved');
  check(creates === 1 && activations === 1);
  const retained = await claimAndRun(journal, lostInput);
  check(
    retained.outcome.status === 'pending' &&
      retained.targetUserId === reserved.operation?.targetUserId
  );
  check(creates === 1 && activations === 1);
  phase = 'lost-provider-acknowledgement';
  const providerInput = {
    ...input,
    operationId: randomUUID(),
    payload: {
      ...input.payload,
      email: `http-lost-provider-${randomUUID()}@tuturuuu.com`,
    },
  };
  let lostCreateSucceeded = false;
  const unknownJournal = createEmployeeCreationJournal({
    store,
    provider: createEmployeeRpcPhaseProvider({
      transport,
      authorize,
      auth: {
        ...auth,
        async createUser(value) {
          const result = await auth.createUser(value);
          lostCreateSucceeded = !result.error;
          throw new Error('Synthetic lost Auth acknowledgement');
        },
      },
    }),
  });
  const unknown = await claimAndRun(unknownJournal, providerInput);
  check(lostCreateSucceeded);
  check(unknown.outcome.status === 'pending');
  check(creates === 2 && activations === 1);
  const pendingProvider = await admin.auth.admin.getUserById(
    unknown.targetUserId
  );
  check(
    !pendingProvider.error &&
      Date.parse(pendingProvider.data.user?.banned_until ?? '') > Date.now()
  );
  const notRetried = await claimAndRun(journal, providerInput);
  check(
    notRetried.outcome.status === 'pending' &&
      notRetried.targetUserId === unknown.targetUserId
  );
  check(creates === 2 && activations === 1);
  if (config.includeRestore) {
    phase = 'restore-runtime';
    restoreQualification = await qualifyEmployeeRestoreHttp({
      ...config,
      admin,
      actorUserId: actorId,
      password,
      authorize,
      async createTarget() {
        const email = `http-restore-${randomUUID()}@tuturuuu.com`;
        const created = await claimAndRun(journal, {
          actorUserId: actorId,
          operationId: randomUUID(),
          payload: {
            email,
            displayName: 'HTTP Restore Employee',
            temporaryPassword: password,
          },
        });
        assert.equal(created.outcome.status, 'created');
        return { id: z.uuid().parse(created.targetUserId), email };
      },
    });
    assert.ok(restoreQualification.qualified);
  }
  phase = 'rejection-adjudication';
  await qualifyEmployeeRejectionHttp({
    ...config,
    admin,
    actorUserId: actorId,
    transport,
    complete: (operationId, email) =>
      claimAndRun(journal, {
        actorUserId: actorId,
        operationId,
        payload: {
          email,
          displayName: 'Adjudicated Employee',
          temporaryPassword: password,
        },
      }),
  });
  assertions++;
  phase = 'complete';
}
try {
  await main();
  console.log(
    JSON.stringify({
      qualified: true,
      phase,
      assertions,
      scope: 'disposable-http-auth-transport',
      productionProof: false,
      routeAuthorizationProof: false,
      ...(restoreQualification ? { restoreQualification } : {}),
    })
  );
} catch {
  // No SDK/SQL/network errors, synthetic passwords or response bodies leave the runner.
  console.log(
    JSON.stringify({
      qualified: false,
      phase,
      assertions,
      productionProof: false,
      routeAuthorizationProof: false,
      ...(restoreQualification ? { restoreQualification } : {}),
    })
  );
  process.exitCode = 1;
}
