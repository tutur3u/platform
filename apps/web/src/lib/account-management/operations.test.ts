import { describe, expect, it, vi } from 'vitest';
import {
  type AccountOperationDependencies,
  runHumanMutation,
} from './operations';
import { AccountManagementError } from './policy';
import { parseMutation } from './requests';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const operationId = '00000000-0000-4000-8000-000000000003';
function fixture() {
  const events: string[] = [];
  const dependencies: AccountOperationDependencies = {
    authority: {
      hasRootRolePermission: vi.fn(async () => true),
      hasEnabledPlatformRole: vi.fn(async () => true),
      hasFreshTotpStepUp: vi.fn(async () => false),
    },
    challenges: { putIfAbsent: vi.fn(), getdel: vi.fn() },
    admit: vi.fn(async () => undefined),
    appendAudit: vi.fn(async (event) => {
      events.push(event.phase);
    }),
    execute: vi.fn<AccountOperationDependencies['execute']>(async () => {
      events.push('supplier');
      return { status: 'completed', targetId };
    }),
  };
  const command = parseMutation({
    action: 'disable',
    operationId,
    targetId,
    disabled: true,
  });
  const input = {
    command,
    route: { action: command.action, targetId },
    human: {
      actorId,
      sessionId: operationId,
      verifiedClaims: {
        aal: 'aal2',
        amr: [{ method: 'totp', timestamp: 1000 }],
      },
    },
    dependencies,
    nowSeconds: 1000,
  };
  return { dependencies, events, input };
}

describe('server account operation boundary', () => {
  it('independently rejects arbitrary domains, passwords, aliases and route mismatch', async () => {
    expect(() =>
      parseMutation({
        action: 'create',
        operationId,
        email: 'test@example.invalid',
      })
    ).toThrow('invalid_request');
    expect(() =>
      parseMutation({
        action: 'create',
        operationId,
        email: 'test@tuturuuu.com',
        password: 'rejected',
      })
    ).toThrow('invalid_request');
    expect(() =>
      parseMutation({ action: 'test-create', operationId, label: 'other' })
    ).toThrow('invalid_request');
    const { input, dependencies } = fixture();
    await expect(
      runHumanMutation({
        ...input,
        route: { action: 'disable', targetId: actorId },
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(dependencies.execute).not.toHaveBeenCalled();
  });

  it('records intent before executing and success before returning completed', async () => {
    const { input, events } = fixture();
    await expect(runHumanMutation(input)).resolves.toMatchObject({
      status: 'completed',
      operationId,
    });
    expect(events).toEqual(['intent', 'supplier', 'success']);
  });

  it('never executes when audit intent cannot persist', async () => {
    const { input, dependencies } = fixture();
    vi.mocked(dependencies.appendAudit).mockRejectedValue(
      new Error('synthetic-private-detail')
    );
    await expect(runHumanMutation(input)).rejects.toThrow('audit_unavailable');
    expect(dependencies.execute).not.toHaveBeenCalled();
  });

  it('preserves uncertainty without supplier retry after a lost response', async () => {
    const { input, dependencies, events } = fixture();
    vi.mocked(dependencies.execute).mockRejectedValue(
      new Error('synthetic-private-detail')
    );
    await expect(runHumanMutation(input)).resolves.toEqual({
      operationId,
      status: 'unknown',
    });
    expect(dependencies.execute).toHaveBeenCalledOnce();
    expect(events).toEqual(['intent', 'unknown']);
  });

  it('returns unknown if the supplier acts but terminal audit fails', async () => {
    const { input, dependencies } = fixture();
    vi.mocked(dependencies.appendAudit)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('audit lost'));
    await expect(runHumanMutation(input)).resolves.toEqual({
      operationId,
      status: 'unknown',
    });
    expect(dependencies.execute).toHaveBeenCalledOnce();
  });

  it('audits revoked authority and blocks before execution', async () => {
    const { input, dependencies, events } = fixture();
    vi.mocked(dependencies.authority.hasEnabledPlatformRole).mockResolvedValue(
      false
    );
    await expect(runHumanMutation(input)).rejects.toMatchObject({
      status: 403,
    });
    expect(dependencies.execute).not.toHaveBeenCalled();
    expect(events).toEqual(['denied']);
  });

  it('blocks replay when the durable intent adapter reports an existing operation', async () => {
    const { input, dependencies } = fixture();
    vi.mocked(dependencies.appendAudit).mockRejectedValue(
      new AccountManagementError('operation_conflict', 409)
    );
    await expect(runHumanMutation(input)).rejects.toMatchObject({
      status: 409,
    });
    expect(dependencies.execute).not.toHaveBeenCalled();
  });
});
