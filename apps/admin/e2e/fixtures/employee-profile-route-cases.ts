import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  fixtureClients,
  rootId,
  type SessionConfig,
  sql,
  ssrSession,
} from '../../../web/e2e/fixtures/employee-web-session-support';
import { createEmployeeCreationJournal } from '../../../web/src/lib/infrastructure/employee-creation-journal';
import { createEmployeeCreationOperationStore } from '../../../web/src/lib/infrastructure/employee-creation-operation-store';
import { createEmployeeRuntimeRpc } from '../../../web/src/lib/infrastructure/employee-creation-rpc';
import { createEmployeeRpcPhaseProvider } from '../../../web/src/lib/infrastructure/employee-creation-rpc-provider';

export const RpcObservation = z.object({
  rpc: z.string(),
  tuple: z.object({
    p_actor_id: z.uuid(),
    p_user_id: z.uuid(),
    p_email: z.email(),
    p_operation_id: z.uuid().optional(),
    p_name: z.string().optional(),
    p_handle: z.string().nullable().optional(),
    p_expected_revision: z.number().int().optional(),
    p_expected_name: z.string().nullable().optional(),
    p_expected_handle: z.string().nullable().optional(),
  }),
});
export type RpcObservation = z.infer<typeof RpcObservation>;

// Generate a real RFC 6238 code from GoTrue's enrollment secret, never a forged JWT.
function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const index = alphabet.indexOf(character);
    assert.ok(index >= 0);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1];
  assert.ok(offset !== undefined);
  return String(
    (digest.readUInt32BE(offset & 15) & 0x7fffffff) % 1000000
  ).padStart(6, '0');
}

export async function qualifyProfileRouteCases(input: {
  config: SessionConfig;
  origin: string;
  observations: RpcObservation[];
  checkpoint(
    event: { kind: 'assertion' } | { kind: 'start' | 'complete'; name: string }
  ): void;
}) {
  const { config, origin, observations } = input;
  const { admin, anon } = fixtureClients(config);
  const password = `Aa1!${randomBytes(24).toString('base64url')}`;
  function check(value: unknown) {
    assert.ok(value);
    input.checkpoint({ kind: 'assertion' });
  }
  async function identity() {
    const result = await admin.auth.admin.createUser({
      email: `profile-route-${randomUUID()}@tuturuuu.com`,
      password,
      email_confirm: true,
    });
    check(!result.error);
    return z.object({ id: z.uuid(), email: z.email() }).parse(result.data.user);
  }
  const actor = await identity();
  sql(
    config,
    `begin;
insert into public.workspaces(id,name,creator_id,personal)
values('${rootId}','Profile route fixture','${actor.id}',false)
on conflict(id) do update set creator_id=excluded.creator_id;
insert into public.workspace_members(ws_id,user_id,type)
values('${rootId}','${actor.id}','MEMBER') on conflict(ws_id,user_id) do update set type='MEMBER';
delete from public.workspace_default_permissions where ws_id='${rootId}';
insert into private.mail_domains(domain,status) values('tuturuuu.com','active')
on conflict(domain) do update set status='active';
commit;`
  );
  const client = anon();
  const login = await client.auth.signInWithPassword({
    email: actor.email,
    password,
  });
  check(!login.error && login.data.session);
  const token = z.string().min(1).parse(login.data.session?.access_token);
  const cookie = await ssrSession(config, actor.email, password, config.url);
  const bearer = { authorization: `Bearer ${token}` };
  const transport = createEmployeeRuntimeRpc({
    url: config.url,
    key: config.key,
  });
  const authorize = async (id: string) =>
    id === actor.id && (await transport.ready(id)).ready;
  const store = createEmployeeCreationOperationStore({
    rpc: transport.rpc,
    authorize: async (id) => {
      if (!(await authorize(id))) return null;
      const now = Date.now();
      return {
        actorUserId: id,
        workspaceId: rootId,
        membership: 'MEMBER',
        permission: 'manage_internal_accounts',
        email: actor.email,
        emailConfirmed: true,
        unbanned: true,
        observedAt: now,
        expiresAt: now + 60000,
      };
    },
  });
  const journal = createEmployeeCreationJournal({
    store,
    provider: createEmployeeRpcPhaseProvider({
      transport,
      auth: admin.auth.admin,
      authorize,
    }),
  });
  async function managedIdentity() {
    const result = await journal.claimAndRun({
      actorUserId: actor.id,
      operationId: randomUUID(),
      payload: {
        email: `profile-managed-${randomUUID()}@tuturuuu.com`,
        displayName: 'Original Name',
        temporaryPassword: password,
      },
    });
    const parsed = z
      .object({
        targetUserId: z.uuid(),
        outcome: z.object({ status: z.literal('created') }),
      })
      .parse(result);
    const user = await admin.auth.admin.getUserById(parsed.targetUserId);
    check(!user.error);
    return z.object({ id: z.uuid(), email: z.email() }).parse(user.data.user);
  }
  const StoredReceipt = z.object({
    operation_id: z.uuid(),
    actor_id: z.uuid(),
    user_id: z.uuid(),
    after_name: z.string(),
    after_handle: z.string().nullable(),
    staff_email: z.email().optional(),
    email: z.email().optional(),
    before_revision: z.number().optional(),
    after_revision: z.number().optional(),
    expected_name: z.string().nullable().optional(),
    expected_handle: z.string().nullable().optional(),
  });
  type Target = Awaited<ReturnType<typeof identity>>;
  function snapshot(target: Target) {
    const id = target.id;
    // Keep credentials and identity rows private; compare them in-process only.
    const text = sql(
      config,
      `select jsonb_build_object(
'public',(select to_jsonb(t) from public.users t where id='${id}'),
'private',(select to_jsonb(t) from public.user_private_details t where user_id='${id}'),
'registry',(select to_jsonb(t) from private.infrastructure_employees t where user_id='${id}'),
'mailbox',(select to_jsonb(t) from private.mail_mailboxes t where id=(select mailbox_id from private.infrastructure_employees where user_id='${id}')),
'handles',(select jsonb_agg(to_jsonb(t) order by value) from public.handles t),
'events',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from private.user_profile_change_events t where user_id='${id}'),
'managedReceipts',(select jsonb_agg(to_jsonb(t) order by operation_id) from private.employee_profile_renames t where user_id='${id}'),
'legacyReceipts',(select jsonb_agg(to_jsonb(t) order by operation_id) from private.unmanaged_internal_profile_operations t where user_id='${id}'),
'immutable',jsonb_build_object(
'auth',(select to_jsonb(t) from auth.users t where id='${id}'),
'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t where user_id='${id}'),
'members',(select jsonb_agg(to_jsonb(t) order by ws_id) from public.workspace_members t where user_id='${id}'),
'roles',(select to_jsonb(t) from public.platform_user_roles t where user_id='${id}'),
'intent',(select to_jsonb(t) from private.employee_creation_intents t where user_id='${id}'),
'creation',(select jsonb_agg(to_jsonb(t) order by operation_id) from private.employee_creation_operations t where target_id='${id}'),
'history',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from private.employee_creation_operation_history t where operation_id in (select operation_id from private.employee_creation_operations where target_id='${id}')),
'public',(select to_jsonb(t)-'display_name'-'handle'-'updated_at' from public.users t where id='${id}'),
'private',(select to_jsonb(t)-'full_name'-'updated_at' from public.user_private_details t where user_id='${id}'),
'mailbox',(select to_jsonb(t)-'display_name'-'sender_name'-'updated_at' from private.mail_mailboxes t where id=(select mailbox_id from private.infrastructure_employees where user_id='${id}'))
));`
    );
    return z
      .object({
        public: z.object({
          display_name: z.string().nullable(),
          handle: z.string().nullable(),
        }),
        private: z.object({ full_name: z.string().nullable() }).nullable(),
        registry: z
          .object({ managed_name: z.string(), revision: z.number() })
          .nullable(),
        mailbox: z
          .object({ display_name: z.string(), sender_name: z.string() })
          .nullable(),
        managedReceipts: z.array(StoredReceipt).nullable(),
        legacyReceipts: z.array(StoredReceipt).nullable(),
        immutable: z.unknown(),
      })
      .passthrough()
      .parse(JSON.parse(text.trim().split('\n').at(-1) ?? ''));
  }
  async function patch(
    target: Target,
    headers: Record<string, string>,
    name: string
  ) {
    const response = await fetch(
      `${origin}/api/v1/infrastructure/internal-accounts/${target.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', origin, ...headers },
        body: JSON.stringify({
          action: 'update_profile',
          displayName: name,
          username: 'hehe',
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      }
    );
    const body: unknown = await response.json();
    return { status: response.status, body };
  }
  function assertRpcs(
    target: Target,
    mode: 'managed' | 'unmanaged',
    start: number,
    name: string
  ) {
    const actual = observations.slice(start);
    const writer =
      mode === 'managed'
        ? 'update_employee_profile'
        : 'update_unmanaged_internal_profile';
    const inspector =
      mode === 'managed'
        ? 'inspect_employee_profile_operation'
        : 'inspect_unmanaged_internal_profile_operation';
    assert.deepEqual(
      actual.map((entry) => entry.rpc),
      ['inspect_employee_profile', writer, inspector]
    );
    input.checkpoint({ kind: 'assertion' });
    for (const entry of actual) {
      check(
        entry.tuple.p_actor_id === actor.id &&
          entry.tuple.p_user_id === target.id &&
          entry.tuple.p_email === target.email
      );
    }
    const write = actual[1];
    const read = actual[2];
    check(write?.tuple.p_name === name && write.tuple.p_handle === 'hehe');
    check(
      Boolean(write?.tuple.p_operation_id) &&
        read?.tuple.p_operation_id === write?.tuple.p_operation_id
    );
  }
  function assertProvenance(
    before: ReturnType<typeof snapshot>,
    after: ReturnType<typeof snapshot>,
    target: Target,
    mode: 'managed' | 'unmanaged',
    start: number
  ) {
    const write = observations[start + 1];
    assert.ok(write);
    const receipts =
      mode === 'managed' ? after.managedReceipts : after.legacyReceipts;
    const receipt = receipts?.find(
      (entry) => entry.operation_id === write.tuple.p_operation_id
    );
    assert.ok(receipt);
    check(receipt.actor_id === actor.id && receipt.user_id === target.id);
    check(
      (mode === 'managed' ? receipt.staff_email : receipt.email) ===
        target.email
    );
    check(
      receipt.after_name === write.tuple.p_name &&
        receipt.after_handle === 'hehe'
    );
    if (mode === 'managed') {
      check(write.tuple.p_expected_revision === before.registry?.revision);
      check(receipt.before_revision === before.registry?.revision);
      check(receipt.after_revision === after.registry?.revision);
    } else {
      check(write.tuple.p_expected_name === before.public.display_name);
      check(write.tuple.p_expected_handle === before.public.handle);
      check(receipt.expected_name === before.public.display_name);
      check(receipt.expected_handle === before.public.handle);
      assert.deepEqual(after.private, before.private);
      input.checkpoint({ kind: 'assertion' });
    }
    check(
      (receipts?.length ?? 0) ===
        ((mode === 'managed' ? before.managedReceipts : before.legacyReceipts)
          ?.length ?? 0) +
          1
    );
    assert.deepEqual(after.handles, before.handles);
    input.checkpoint({ kind: 'assertion' });
  }
  async function policy(required: boolean, verifiedAfter: number) {
    const result = await admin.auth.admin.updateUserById(actor.id, {
      app_metadata: { tuturuuu_required_mfa: { required, verifiedAfter } },
    });
    check(!result.error);
  }
  for (const mode of ['managed', 'unmanaged'] as const) {
    const target =
      mode === 'managed' ? await managedIdentity() : await identity();
    const competitor =
      mode === 'managed' ? await managedIdentity() : await identity();
    const seed =
      mode === 'managed'
        ? `select private.update_employee_profile('${actor.id}','${target.id}','${target.email}',0,'${randomUUID()}','Original Name','hehe');`
        : `select private.update_unmanaged_internal_profile('${actor.id}','${target.id}','${target.email}','${randomUUID()}',
(select display_name from public.users where id='${target.id}'),(select handle from public.users where id='${target.id}'),'Original Name','hehe');`;
    sql(
      config,
      `${seed}
update private.user_profile_change_events set changed_at=now()-interval '27 days' where user_id in ('${target.id}','${competitor.id}');`
    );
    const retainedToken = token;
    async function denied(
      label: string,
      deniedTarget: Target,
      headers: Record<string, string>,
      status: number,
      rpc = false
    ) {
      input.checkpoint({ kind: 'start', name: `${mode}/${label}` });
      const before = snapshot(deniedTarget);
      const start = observations.length;
      const result = await patch(deniedTarget, headers, 'Denied Name');
      check(result.status === status);
      assert.deepEqual(snapshot(deniedTarget), before);
      input.checkpoint({ kind: 'assertion' });
      if (rpc) assertRpcs(deniedTarget, mode, start, 'Denied Name');
      else check(observations.length === start);
      input.checkpoint({ kind: 'complete', name: `${mode}/${label}` });
    }
    await denied('anonymous', target, {}, 401);
    await denied(
      'malformed-bearer',
      target,
      { cookie, authorization: 'Bearer invalid' },
      401
    );
    input.checkpoint({ kind: 'start', name: `${mode}/owned-hehe` });
    const before = snapshot(target);
    const start = observations.length;
    const result = await patch(target, bearer, 'Duyên Dương');
    check(result.status === 200);
    const reply = z
      .object({
        account: z.object({
          id: z.uuid(),
          displayName: z.string(),
          username: z.string(),
        }),
      })
      .parse(result.body);
    check(
      reply.account.id === target.id &&
        reply.account.displayName === 'Duyên Dương' &&
        reply.account.username === 'hehe'
    );
    assertRpcs(target, mode, start, 'Duyên Dương');
    const after = snapshot(target);
    check(
      after.public.display_name === 'Duyên Dương' &&
        after.public.handle === 'hehe'
    );
    if (mode === 'managed') check(after.private?.full_name === 'Duyên Dương');
    else {
      assert.deepEqual(after.private, before.private);
      input.checkpoint({ kind: 'assertion' });
    }
    assert.deepEqual(after.immutable, before.immutable);
    input.checkpoint({ kind: 'assertion' });
    if (mode === 'managed') {
      check(
        after.registry?.managed_name === 'Duyên Dương' &&
          after.registry.revision === (before.registry?.revision ?? -1) + 1
      );
      check(
        after.mailbox?.display_name === 'Duyên Dương' &&
          after.mailbox.sender_name === 'Duyên Dương'
      );
      check(
        (after.managedReceipts?.length ?? 0) ===
          (before.managedReceipts?.length ?? 0) + 1
      );
      assert.deepEqual(after.legacyReceipts, before.legacyReceipts);
    } else {
      check(
        after.registry === null &&
          after.mailbox === null &&
          after.managedReceipts === null
      );
      check(
        (after.legacyReceipts?.length ?? 0) ===
          (before.legacyReceipts?.length ?? 0) + 1
      );
    }
    input.checkpoint({ kind: 'assertion' });
    assertProvenance(before, after, target, mode, start);
    input.checkpoint({ kind: 'complete', name: `${mode}/owned-hehe` });
    await denied('competitor', competitor, bearer, 409, true);
    sql(
      config,
      `delete from public.workspace_members where ws_id='${rootId}' and user_id='${actor.id}';`
    );
    await denied(
      'root-revoked',
      target,
      { authorization: `Bearer ${retainedToken}` },
      403
    );
    sql(
      config,
      `insert into public.workspace_members(ws_id,user_id,type) values('${rootId}','${actor.id}','MEMBER');`
    );
    check(
      !(
        await admin.auth.admin.updateUserById(actor.id, { ban_duration: '24h' })
      ).error
    );
    await denied(
      'banned',
      target,
      { authorization: `Bearer ${retainedToken}` },
      401
    );
    check(
      !(
        await admin.auth.admin.updateUserById(actor.id, {
          ban_duration: 'none',
        })
      ).error
    );
    await policy(true, Math.floor(Date.now() / 1000));
    await denied('aal1-policy', target, bearer, 403);
    input.checkpoint({ kind: 'start', name: `${mode}/totp` });
    const enrolled = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Profile ${mode}`,
    });
    check(!enrolled.error);
    const factor = z
      .object({ id: z.uuid(), totp: z.object({ secret: z.string() }) })
      .parse(enrolled.data);
    await delay(1100);
    const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
    check(!challenge.error);
    const challengeId = z.uuid().parse(challenge.data?.id);
    const verified = await client.auth.mfa.verify({
      factorId: factor.id,
      challengeId,
      code: totp(factor.totp.secret),
    });
    check(!verified.error);
    const aal2 = z.string().min(1).parse(verified.data?.access_token);
    const mfaBefore = snapshot(target);
    const mfaStart = observations.length;
    const mfaResult = await patch(
      target,
      { authorization: `Bearer ${aal2}` },
      'Duyên Dương MFA'
    );
    check(mfaResult.status === 200);
    assertRpcs(target, mode, mfaStart, 'Duyên Dương MFA');
    const mfaAfter = snapshot(target);
    check(
      mfaAfter.public.display_name === 'Duyên Dương MFA' &&
        mfaAfter.public.handle === 'hehe'
    );
    assert.deepEqual(mfaAfter.immutable, mfaBefore.immutable);
    input.checkpoint({ kind: 'assertion' });
    assertProvenance(mfaBefore, mfaAfter, target, mode, mfaStart);
    input.checkpoint({ kind: 'complete', name: `${mode}/totp` });
    await policy(true, Math.floor(Date.now() / 1000));
    await denied(
      'mfa-invalidated',
      target,
      { authorization: `Bearer ${aal2}` },
      403
    );
    await policy(false, 0);
    check(!(await client.auth.mfa.unenroll({ factorId: factor.id })).error);
    // Keep this case's owner; release the fixture handle only between modes.
    sql(
      config,
      `update private.user_profile_change_events set changed_at=now()-interval '27 days' where user_id='${target.id}';
select ${
        mode === 'managed'
          ? `private.update_employee_profile('${actor.id}','${target.id}','${target.email}',(select revision from private.infrastructure_employees where user_id='${target.id}'),'${randomUUID()}','Duyên Dương MFA',null)`
          : `private.update_unmanaged_internal_profile('${actor.id}','${target.id}','${target.email}','${randomUUID()}','Duyên Dương MFA','hehe','Duyên Dương MFA',null)`
      };
delete from public.handles where value='hehe' and creator_id='${target.id}';`
    );
  }
}
