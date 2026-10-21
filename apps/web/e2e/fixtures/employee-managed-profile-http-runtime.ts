import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { EmployeeCreationReplySchema } from '../../../../packages/internal-api/src/infrastructure/employee-creation';
import { updateManagedEmployeeProfile } from '../../../../packages/utils/src/internal-accounts/employee-managed-profile';
import { createEmployeeManagementTransport } from '../../../../packages/utils/src/internal-accounts/employee-management-rpc';
import type { createEmployeeRuntimeRpc } from '../../src/lib/infrastructure/employee-creation-rpc';

/** Actual PostgREST transactions in the same owned full-schema disposable project. */
export async function qualifyManagedProfileHttp(input: {
  url: string;
  key: string;
  anonKey: string;
  actorUserId: string;
  transport: ReturnType<typeof createEmployeeRuntimeRpc>;
  createTarget(): Promise<{ id: string; email: string; operationId: string }>;
}) {
  let assertions = 0;
  const check = (value: unknown) => {
    assert.ok(value);
    assertions++;
  };
  const target = await input.createTarget();
  const operationId = randomUUID();
  let writes = 0;
  const profile = await updateManagedEmployeeProfile({
    ...input,
    targetUserId: target.id,
    email: target.email,
    displayName: 'Duyên Dương',
    username: 'hehe',
    operationId,
    authorize: async (actor) => actor === input.actorUserId,
    fetch: async (url, options) => {
      const response = await fetch(url, options);
      if (String(url).endsWith('/rpc/update_employee_profile')) {
        writes++;
        check(response.ok);
        // Consume the actual committed reply, then simulate losing it at the client.
        await response.arrayBuffer();
        throw new Error('Synthetic lost acknowledgement');
      }
      return response;
    },
  });
  check(writes === 1);
  check(profile?.displayName === 'Duyên Dương');
  check(profile?.username === 'hehe');
  const observed = await input.transport.inspect(
    input.actorUserId,
    target.operationId
  );
  check(observed.account?.displayName === 'Duyên Dương');
  check(observed.account?.creationDisplayName === 'Managed HTTP Original');
  check(observed.operation?.displayName === 'Managed HTTP Original');
  check(
    !EmployeeCreationReplySchema.safeParse({
      status: 'created',
      operationId: target.operationId,
      account: {
        id: target.id,
        email: target.email,
        displayName: 'Duyên Dương',
        creationDisplayName: 'Managed HTTP Original',
      },
    }).success
  );
  const call = createEmployeeManagementTransport({
    ...input,
    authorize: async () => true,
  });
  assert.ok(profile);
  const payload = {
    p_actor_id: input.actorUserId,
    p_user_id: target.id,
    p_email: target.email,
    p_expected_revision: 0,
    p_operation_id: operationId,
    p_name: profile.displayName,
    p_handle: profile.username,
  };
  const replay = await call(
    'update_employee_profile',
    input.actorUserId,
    payload
  );
  check(
    !replay.error && typeof replay.data === 'object' && replay.data !== null
  );
  const conflict = await call('update_employee_profile', input.actorUserId, {
    ...payload,
    p_name: 'Forged payload',
  });
  check(conflict.error?.code === '23505');
  const stale = await call('update_employee_profile', input.actorUserId, {
    ...payload,
    p_operation_id: randomUUID(),
  });
  check(stale.error?.code === '23514');
  const denied = await fetch(
    new URL('/rest/v1/rpc/update_employee_profile', input.url),
    {
      method: 'POST',
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${input.anonKey}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'private',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    }
  );
  check(denied.status === 401 || denied.status === 403);
  const usernameLengths = [4];
  const duplicateTarget = await input.createTarget();
  const receiptSchema = z.object({
    operationId: z.uuid(),
    id: z.uuid(),
    username: z.string(),
    revision: z.number(),
  });
  for (const username of [
    'q',
    'a'.repeat(33),
    'b'.repeat(65),
    'c'.repeat(81),
    'x'.repeat(1001),
  ]) {
    const candidate = await input.createTarget();
    const request = {
      p_actor_id: input.actorUserId,
      p_user_id: candidate.id,
      p_email: candidate.email,
      p_expected_revision: 0,
      p_operation_id: randomUUID(),
      p_name: 'Duyên Dương',
      p_handle: username,
    };
    const saved = await call(
      'update_employee_profile',
      input.actorUserId,
      request
    );
    check(!saved.error);
    const receipt = receiptSchema.parse(saved.data);
    check(
      receipt.username === username &&
        receipt.revision === 1 &&
        receipt.id === candidate.id
    );
    const inspected = await call(
      'inspect_employee_profile_operation',
      input.actorUserId,
      {
        p_actor_id: input.actorUserId,
        p_user_id: candidate.id,
        p_email: candidate.email,
        p_operation_id: request.p_operation_id,
      }
    );
    check(!inspected.error);
    const independent = z
      .object({ receipt: receiptSchema })
      .parse(inspected.data);
    check(isDeepStrictEqual(independent.receipt, receipt));
    const repeated = await call(
      'update_employee_profile',
      input.actorUserId,
      request
    );
    check(
      !repeated.error &&
        isDeepStrictEqual(receiptSchema.parse(repeated.data), receipt)
    );
    const staleRevision = await call(
      'update_employee_profile',
      input.actorUserId,
      {
        ...request,
        p_operation_id: randomUUID(),
      }
    );
    check(staleRevision.error?.code === '23514');
    const duplicate = await call('update_employee_profile', input.actorUserId, {
      ...request,
      p_user_id: duplicateTarget.id,
      p_email: duplicateTarget.email,
      p_operation_id: randomUUID(),
    });
    check(duplicate.error?.code === '23505');
    usernameLengths.push(username.length);
  }
  const unmanagedProfileQualification = await qualifyUnmanagedProfileHttp(
    input,
    target
  );
  return {
    qualified: true,
    assertions,
    writes,
    usernameLengths,
    unmanagedProfileQualification,
    lostAcknowledgementReadback: true,
    routeAuthorizationProof: false,
    productionProof: false,
  };
}

/** Bounded legacy identities belong only to this disposable qualification project. */
async function qualifyUnmanagedProfileHttp(
  input: Parameters<typeof qualifyManagedProfileHttp>[0],
  managedTarget: { id: string; email: string }
) {
  let assertions = 0;
  let writes = 0;
  let lostAcknowledgements = 0;
  const check = (value: unknown) => {
    assert.ok(value);
    assertions++;
  };
  const headers = {
    apikey: input.key,
    Authorization: `Bearer ${input.key}`,
    'Content-Type': 'application/json',
    'Content-Profile': 'private',
    'Accept-Profile': 'private',
    Prefer: 'tx=commit',
  };
  const receiptSchema = z
    .object({
      operationId: z.uuid(),
      actorUserId: z.uuid(),
      id: z.uuid(),
      email: z.email(),
      expectedDisplayName: z.string().nullable(),
      expectedUsername: z.string().nullable(),
      displayName: z.string(),
      username: z.string().nullable(),
    })
    .strict();
  const observationSchema = z
    .object({
      current: z
        .object({
          managed: z.literal(false),
          id: z.uuid(),
          email: z.email(),
          displayName: z.string().nullable(),
          username: z.string().nullable(),
        })
        .strict(),
      receipt: receiptSchema.nullable(),
    })
    .strict();
  const request = (name: string, body: object) =>
    fetch(new URL(`/rest/v1/rpc/${name}`, input.url), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
  const call = async (
    name:
      | 'update_unmanaged_internal_profile'
      | 'inspect_unmanaged_internal_profile_operation',
    body: object
  ) => {
    const response = await request(name, body);
    const data: unknown = await response.json();
    if (!response.ok)
      return { data: null, error: z.object({ code: z.string() }).parse(data) };
    return { data, error: null };
  };
  const createTarget = async () => {
    const email = `legacy-profile-${randomUUID()}@tuturuuu.com`;
    const response = await fetch(new URL('/auth/v1/admin/users', input.url), {
      method: 'POST',
      headers: {
        apikey: input.key,
        Authorization: `Bearer ${input.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        email_confirm: false,
        password: `${randomUUID()}aA!9`,
        user_metadata: { full_name: 'Legacy HTTP Original' },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    check(response.ok);
    const user = z
      .object({ id: z.uuid(), email: z.literal(email) })
      .parse(await response.json());
    return {
      p_actor_id: input.actorUserId,
      p_user_id: user.id,
      p_email: user.email,
    };
  };
  const duplicate = await createTarget();
  const duplicateInitial = await call(
    'inspect_unmanaged_internal_profile_operation',
    { ...duplicate, p_operation_id: randomUUID() }
  );
  check(!duplicateInitial.error);
  const duplicateCurrent = observationSchema.parse(
    duplicateInitial.data
  ).current;
  const usernameLengths = [];
  for (const username of [
    'v',
    'haha',
    'n'.repeat(33),
    'o'.repeat(65),
    'p'.repeat(81),
    'r'.repeat(1001),
  ]) {
    const tuple = await createTarget();
    const p_operation_id = randomUUID();
    const initial = await call('inspect_unmanaged_internal_profile_operation', {
      ...tuple,
      p_operation_id,
    });
    check(!initial.error);
    const preimage = observationSchema.parse(initial.data).current;
    const payload = {
      ...tuple,
      p_operation_id,
      p_expected_name: preimage.displayName,
      p_expected_handle: preimage.username,
      p_name: 'Legacy HTTP Updated',
      p_handle: username,
    };
    const lostAck = new Error('Synthetic legacy lost acknowledgement');
    try {
      writes++;
      const response = await request(
        'update_unmanaged_internal_profile',
        payload
      );
      check(response.ok);
      await response.arrayBuffer();
      throw lostAck;
    } catch (error) {
      check(error === lostAck);
      lostAcknowledgements++;
    }
    const independent = await call(
      'inspect_unmanaged_internal_profile_operation',
      { ...tuple, p_operation_id }
    );
    check(!independent.error);
    const observed = observationSchema.parse(independent.data);
    const expected = {
      operationId: p_operation_id,
      actorUserId: tuple.p_actor_id,
      id: tuple.p_user_id,
      email: tuple.p_email,
      expectedDisplayName: preimage.displayName,
      expectedUsername: preimage.username,
      displayName: payload.p_name,
      username,
    };
    check(
      isDeepStrictEqual(observed.receipt, expected) &&
        observed.current.username === username &&
        observed.current.displayName === payload.p_name &&
        observed.current.id === tuple.p_user_id &&
        observed.current.email === tuple.p_email
    );
    const replay = await call('update_unmanaged_internal_profile', payload);
    check(
      !replay.error &&
        isDeepStrictEqual(receiptSchema.parse(replay.data), expected)
    );
    const stale = await call('update_unmanaged_internal_profile', {
      ...payload,
      p_operation_id: randomUUID(),
    });
    check(stale.error?.code === '23514');
    const conflict = await call('update_unmanaged_internal_profile', {
      ...payload,
      p_name: 'Changed payload',
    });
    check(conflict.error?.code === '23505');
    const duplicateWrite = await call('update_unmanaged_internal_profile', {
      ...payload,
      ...duplicate,
      p_operation_id: randomUUID(),
      p_expected_name: duplicateCurrent.displayName,
      p_expected_handle: duplicateCurrent.username,
    });
    check(duplicateWrite.error?.code === '23505');
    const ownershipUrl = new URL('/rest/v1/handles', input.url);
    ownershipUrl.searchParams.set('value', `eq.${username}`);
    ownershipUrl.searchParams.set('select', 'creator_id');
    const ownershipResponse = await fetch(ownershipUrl, {
      headers: { apikey: input.key, Authorization: `Bearer ${input.key}` },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const owners = z
      .array(z.object({ creator_id: z.uuid() }))
      .parse(await ownershipResponse.json());
    check(
      ownershipResponse.ok &&
        owners.length === 1 &&
        owners[0]?.creator_id === tuple.p_user_id
    );
    usernameLengths.push(username.length);
  }
  for (const username of ['v', 'haha', 'n'.repeat(33)]) {
    const response = await fetch(
      new URL('/rest/v1/rpc/update_public_user_profile', input.url),
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Profile': 'public',
          'Accept-Profile': 'public',
        },
        body: JSON.stringify({
          p_user_id: duplicate.p_user_id,
          p_patch: { handle: username },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      }
    );
    const error = z.object({ code: z.string() }).parse(await response.json());
    check(!response.ok && error.code === '22023');
  }
  const managed = await call('update_unmanaged_internal_profile', {
    p_actor_id: input.actorUserId,
    p_user_id: managedTarget.id,
    p_email: managedTarget.email,
    p_operation_id: randomUUID(),
    p_expected_name: null,
    p_expected_handle: null,
    p_name: 'Loose Rename',
    p_handle: 'legacyloose',
  });
  check(managed.error?.code === '23514');
  const ordinary = await call('update_unmanaged_internal_profile', {
    ...duplicate,
    p_actor_id: duplicate.p_user_id,
    p_operation_id: randomUUID(),
    p_expected_name: duplicateCurrent.displayName,
    p_expected_handle: duplicateCurrent.username,
    p_name: 'Forbidden',
    p_handle: 'forbiddenlegacy',
  });
  check(ordinary.error?.code === '42501');
  check(writes === 6);
  check(lostAcknowledgements === 6);
  return {
    version: 1,
    qualified: true,
    assertions,
    writes,
    lostAcknowledgements,
    usernameLengths,
    routeAuthorizationProof: false,
    productionProof: false,
  };
}
