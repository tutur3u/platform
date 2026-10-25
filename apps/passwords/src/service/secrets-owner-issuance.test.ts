import { randomUUID } from 'node:crypto';
import { PasswordsError } from '@tuturuuu/storage-core/vault/passwords-contract';
import { expect, it, vi } from 'vitest';
import type { VaultRpc } from './machine-repository';
import { parseMachineToken } from './machine-token';
import { issueOwnerMachineCredential } from './secrets-owner-issuance';
import { SECRETS_ORIGIN } from './secrets-protocol';

function fixture() {
  const now = Date.now();
  const input = {
    wsId: randomUUID(),
    vaultId: randomUUID(),
    grantRequestId: randomUUID(),
    tokenRequestId: randomUUID(),
    itemIds: [randomUUID()],
    scopes: ['item.write'] as 'item.write'[],
    grantExpiresAt: now + 3600000,
  };
  const actor = randomUUID();
  const owner = vi.fn(async () => ({
    actor,
    vault: { role: 'owner', revision: 2 },
  }));
  const rpc = vi.fn<VaultRpc>(async () => ({ revision: 3, replayed: false }));
  const deps = {
    enabled: () => true,
    now: () => now,
    origin: SECRETS_ORIGIN,
    owner,
    rpc,
    request: new Request(`${SECRETS_ORIGIN}/api/v1/secrets/credentials`, {
      method: 'POST',
      headers: {
        origin: SECRETS_ORIGIN,
        'content-type': 'application/json',
      },
    }),
  };
  return { input, deps, owner, rpc };
}
it('issues owner-approved scoped grant and digest-only short-lived token', async () => {
  const f = fixture();
  const result = await issueOwnerMachineCredential(f.input, f.deps);
  expect(result.version).toBe(1);
  expect(parseMachineToken(result.token).digest).toBe(
    f.rpc.mock.calls[1]?.[0].p_input.token_digest
  );
  expect(f.rpc.mock.calls.map(([call]) => call.p_request)).toEqual([
    f.input.grantRequestId,
    f.input.tokenRequestId,
  ]);
  expect(JSON.stringify(f.rpc.mock.calls)).not.toContain(result.token);
  expect(f.owner).toHaveBeenCalledTimes(2);
});
it('fresh owner assurance failure happens before grant mutation', async () => {
  const f = fixture();
  f.owner.mockRejectedValue(new PasswordsError('STEP_UP_REQUIRED'));
  await expect(
    issueOwnerMachineCredential(f.input, f.deps)
  ).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED' });
  expect(f.rpc).not.toHaveBeenCalled();
});
it('rejects grants beyond 24 hours and stops before owner/SQL when disabled', async () => {
  const f = fixture();
  f.input.grantExpiresAt += 24 * 3600000;
  await expect(
    issueOwnerMachineCredential(f.input, f.deps)
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(f.owner).not.toHaveBeenCalled();
  f.deps.enabled = () => false;
  await expect(
    issueOwnerMachineCredential(f.input, f.deps)
  ).rejects.toMatchObject({ code: 'STOPPED' });
  expect(f.owner).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalled();
});
it('preserves unknown grant outcome and does not issue token or retry', async () => {
  const f = fixture();
  f.rpc.mockRejectedValueOnce(new Error('lost reply'));
  await expect(
    issueOwnerMachineCredential(f.input, f.deps)
  ).rejects.toMatchObject({ code: 'OPERATION_UNCERTAIN' });
  expect(f.rpc).toHaveBeenCalledTimes(1);
});
it('a later fresh-owner denial cannot settle an earlier grant write', async () => {
  const f = fixture();
  f.owner.mockResolvedValueOnce({
    actor: randomUUID(),
    vault: { role: 'owner', revision: 2 },
  });
  f.owner.mockRejectedValueOnce(new PasswordsError('STEP_UP_REQUIRED'));
  await expect(
    issueOwnerMachineCredential(f.input, f.deps)
  ).rejects.toMatchObject({ code: 'OPERATION_UNCERTAIN' });
  expect(f.rpc).toHaveBeenCalledTimes(1);
});
