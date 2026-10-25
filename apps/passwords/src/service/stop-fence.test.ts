import { describe, expect, it, vi } from 'vitest';
import type { PasswordsServicePort } from './port';
import { fenceService, isPasswordsEnabled } from './stop-fence';

function countingPort() {
  const call = vi.fn(async () => ({ ok: true, value: {} }));
  const port = {
    state: call,
    downloadCredentials: call,
    observeOperation: call,
    createVault: call,
    putItem: call,
    revealItem: call,
    setMember: call,
    rotateVault: call,
    audit: call,
  } as unknown as PasswordsServicePort;
  return { port, call };
}

describe('isPasswordsEnabled', () => {
  it('is on only for the exact string true', () => {
    expect(isPasswordsEnabled({ PASSWORDS_ENABLED: 'true' })).toBe(true);
    for (const value of [
      undefined,
      '',
      'false',
      'TRUE',
      'True',
      '1',
      ' true',
      'yes',
    ])
      expect(isPasswordsEnabled({ PASSWORDS_ENABLED: value })).toBe(false);
  });
});

describe('fenceService', () => {
  const input = {
    wsId: 'w',
    vaultId: 'v',
    itemId: 'i',
    userId: 'u',
    requestId: 'r',
    revision: 1,
    name: 'n',
    base64: '',
    role: 'viewer',
    revoked: false,
  } as never;

  it('performs zero service calls for any operation while closed', async () => {
    const { port, call } = countingPort();
    const fenced = fenceService(port, () => false);
    for (const op of [
      'state',
      'observeOperation',
      'downloadCredentials',
      'createVault',
      'putItem',
      'revealItem',
      'setMember',
      'rotateVault',
      'audit',
    ] as const)
      expect(await fenced[op](input)).toEqual({ ok: false, code: 'STOPPED' });
    expect(call).not.toHaveBeenCalled();
  });

  it('re-reads the fence on every call, so closing it stops later calls', async () => {
    const { port, call } = countingPort();
    let enabled = true;
    const fenced = fenceService(port, () => enabled);
    await fenced.state(input);
    enabled = false;
    expect(await fenced.revealItem(input)).toEqual({
      ok: false,
      code: 'STOPPED',
    });
    expect(call).toHaveBeenCalledTimes(1);
  });
});
