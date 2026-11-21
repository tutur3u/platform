import { describe, expect, it, vi } from 'vitest';
import type { AccountsClient } from '../accounts';
import { runAccountsCommand } from './accounts';

const targetId = '90000000-0000-4000-8000-000000000001';
function fixture() {
  const execute = vi.fn(async () => ({
    status: 'completed',
    operationId: targetId,
  }));
  const requestAdminChallenge = vi.fn(async () => 'a'.repeat(32));
  const client = {
    execute,
    requestAdminChallenge,
  } as unknown as AccountsClient;
  const createHuman = vi.fn(() => client);
  const createMachine = vi.fn(async () => client);
  return {
    execute,
    requestAdminChallenge,
    opts: {
      target: targetId,
      json: true,
      write: vi.fn(),
      createHuman,
      createMachine,
    },
  };
}

describe('ttr accounts', () => {
  it('refuses closed commands and credential flags before constructing a client', async () => {
    const { opts } = fixture();
    await expect(
      runAccountsCommand({ ...opts, action: 'enable', flags: {} })
    ).rejects.toThrow('D292');
    await expect(
      runAccountsCommand({
        ...opts,
        action: 'test-create',
        flags: { token: 'fixture' },
      })
    ).rejects.toThrow('credential store');
    expect(opts.createHuman).not.toHaveBeenCalled();
    expect(opts.createMachine).not.toHaveBeenCalled();
  });

  it('requires the exact target before requesting a server challenge', async () => {
    const { opts, requestAdminChallenge, execute } = fixture();
    await expect(
      runAccountsCommand({
        ...opts,
        action: 'admin',
        flags: { enabled: 'true' },
      })
    ).rejects.toThrow('exact target UUID');
    expect(requestAdminChallenge).not.toHaveBeenCalled();
    await runAccountsCommand({
      ...opts,
      action: 'admin',
      flags: { enabled: 'true', confirm: targetId },
    });
    const draft = requestAdminChallenge.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(draft[0]).toMatchObject({
      targetId,
      confirmTarget: targetId,
      enabled: true,
    });
    expect(execute).toHaveBeenCalledWith({
      ...draft[0],
      challenge: 'a'.repeat(32),
    });
    expect(JSON.stringify(opts.write.mock.calls)).not.toContain('a'.repeat(32));
  });

  it('selects the machine client only for test and own operation status commands', async () => {
    const { opts, execute } = fixture();
    await expect(
      runAccountsCommand({ ...opts, action: 'list', flags: { fleet: true } })
    ).rejects.toThrow('test account operations only');
    await runAccountsCommand({
      ...opts,
      action: 'test-create',
      flags: { fleet: true, label: 'a1' },
    });
    expect(opts.createMachine).toHaveBeenCalledOnce();
    expect(opts.createHuman).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'test-create', label: 'a1' })
    );
  });
});
