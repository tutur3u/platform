import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { EmployeeRejectionRecoverySchema } from '../../../../packages/internal-api/src/infrastructure/employee-rejection-recovery';
import { EmployeeOperationSnapshotSchema } from '../../src/lib/infrastructure/employee-creation-operation-store';
import { createEmployeeRuntimeRpc } from '../../src/lib/infrastructure/employee-creation-rpc';
import {
  assertTerminalRejection,
  terminalRejectionCredentials,
} from './employee-rejection-http-proof';
import { type SessionConfig, sql } from './employee-web-session-support';

export async function qualifyEmployeeRejectionWebSession(input: {
  config: SessionConfig;
  admin: SupabaseClient;
  actorUserId: string;
  password: string;
  endpoint: string;
  headers: Record<string, string>;
  revokedHeaders: Record<string, string>;
  request(
    url: string,
    headers: Record<string, string>,
    body?: object
  ): Promise<{ response: Response; value: unknown }>;
}) {
  const { rpc, inspect } = createEmployeeRuntimeRpc(input.config);
  const operationId = randomUUID();
  const email = `web-rejected-${randomUUID()}@tuturuuu.com`;
  const identity = {
    actorUserId: input.actorUserId,
    operationId,
    email,
    displayName: 'Web Rejected Employee',
  };
  await rpc.claim(identity);
  const op = EmployeeOperationSnapshotSchema.parse(
    (await inspect(input.actorUserId, operationId)).operation
  );
  const originalLeaseId = z.uuid().parse(op.leaseId);
  const eventId = randomUUID();
  await rpc.advance({
    actorUserId: input.actorUserId,
    operationId,
    leaseId: originalLeaseId,
    expectedVersion: 0,
    eventId,
    nextPhase: 'auth_attempted',
    receipt: null,
  });
  const rejected = await input.admin.auth.admin.createUser({
    id: op.targetUserId,
    email,
    ...terminalRejectionCredentials,
    email_confirm: true,
    ban_duration: '876000h',
    app_metadata: { employee_onboarding: true },
  });
  assertTerminalRejection(rejected);
  const absent = await input.admin.auth.admin.getUserById(op.targetUserId);
  assert.equal(absent.error?.status, 404);
  assert.equal(absent.data.user, null);
  await rpc.advance({
    actorUserId: input.actorUserId,
    operationId,
    leaseId: originalLeaseId,
    expectedVersion: 1,
    eventId: randomUUID(),
    nextPhase: 'unknown',
    receipt: null,
  });
  sql(
    input.config,
    `update private.employee_creation_operations set lease_expires_at=clock_timestamp()-interval '1 second' where actor_id='${input.actorUserId}' and operation_id='${operationId}';`
  );
  const endpoint = `${input.endpoint}/operations/${operationId}/rejection`;
  assert.equal((await input.request(endpoint, {})).response.status, 401);
  assert.equal(
    (await input.request(endpoint, input.revokedHeaders)).response.status,
    401
  );
  const state = EmployeeRejectionRecoverySchema.parse(
    (await input.request(endpoint, input.headers)).value
  );
  assert.equal(state.status, 'eligible');
  assert.ok(state.status === 'eligible');
  const body = {
    workspaceId: '00000000-0000-0000-0000-000000000000',
    adjudication: {
      ...identity,
      targetUserId: op.targetUserId,
      expectedVersion: 2,
      originalLeaseId,
      originalAttemptEventId: eventId,
      eventId: randomUUID(),
      evidenceReferenceSha256: 'b'.repeat(64),
      reason: 'administrator_adjudicated_terminal_auth_rejection',
      attestation: {
        kind: 'administrator-adjudication-v1',
        terminalAuthRejection: true,
        noRequestInFlight: true,
        absenceIsNotRejectionProof: true,
        acceptResponsibility: true,
      },
    },
  };
  assert.equal(
    (
      await input.request(endpoint, input.headers, {
        ...body,
        workspaceId: randomUUID(),
      })
    ).response.status,
    400
  );
  assert.equal(
    (
      await input.request(endpoint, input.headers, {
        ...body,
        adjudication: { ...body.adjudication, actorUserId: randomUUID() },
      })
    ).response.status,
    403
  );
  assert.equal(
    (
      await input.request(endpoint, input.headers, {
        ...body,
        adjudication: { ...body.adjudication, attestation: {} },
      })
    ).response.status,
    400
  );
  assert.equal(
    (
      await input.request(
        endpoint,
        { ...input.headers, origin: 'https://foreign.example.test' },
        body
      )
    ).response.status,
    403
  );
  assert.equal(
    (
      await input.request(endpoint, input.headers, {
        ...body,
        adjudication: { ...body.adjudication, targetUserId: randomUUID() },
      })
    ).response.status,
    409
  );
  const reset = await input.request(endpoint, input.headers, body);
  assert.equal(reset.response.status, 200);
  const ready = EmployeeRejectionRecoverySchema.parse(reset.value);
  assert.ok(ready.status === 'retry_ready');
  assert.equal(ready.eventId, body.adjudication.eventId);
  assert.equal(ready.targetUserId, op.targetUserId);
  assert.deepEqual(
    EmployeeRejectionRecoverySchema.parse(
      (await input.request(endpoint, input.headers)).value
    ),
    ready
  );
  assert.equal(
    (await input.request(endpoint, input.headers, body)).response.status,
    409
  );
  const created = await input.request(
    input.endpoint,
    { ...input.headers, 'idempotency-key': operationId },
    {
      email,
      displayName: identity.displayName,
      temporaryPassword: input.password,
    }
  );
  assert.equal(created.response.status, 201);
  const final = await inspect(input.actorUserId, operationId);
  assert.equal(final.operation?.phase, 'active');
  assert.equal(final.account?.id, op.targetUserId);
  const auth = await input.admin.auth.admin.getUserById(op.targetUserId);
  assert.equal(auth.error, null);
  assert.equal(auth.data.user.email, email);
  assert.ok(
    !auth.data.user.banned_until ||
      Date.parse(auth.data.user.banned_until) <= Date.now()
  );
}
