import { describe, expect, it, vi } from 'vitest';
import { createAuthorizedWorkspaceReader } from './workspace-actions';

describe('authorized workspace reader', () => {
  it('refuses an absent actor before reading any workspaces', async () => {
    const readWorkspaces = vi.fn(async () => [{ id: 'private' }]);
    const read = createAuthorizedWorkspaceReader({
      getActor: async () => null,
      readWorkspaces,
    });
    await expect(read()).rejects.toThrow('Unauthorized');
    expect(readWorkspaces).not.toHaveBeenCalled();
  });
  it('reads once after checking the app-provided actor', async () => {
    const order: string[] = [];
    const workspaces = [{ id: 'allowed' }];
    const read = createAuthorizedWorkspaceReader({
      getActor: async () => {
        order.push('actor');
        return { id: 'user' };
      },
      readWorkspaces: async () => {
        order.push('workspaces');
        return workspaces;
      },
    });
    expect(await read()).toBe(workspaces);
    expect(order).toEqual(['actor', 'workspaces']);
  });
  it('preserves an unknown supplier outcome without replaying', async () => {
    const failure = new Error('unconfirmed supplier');
    const readWorkspaces = vi.fn(async () => {
      throw failure;
    });
    const read = createAuthorizedWorkspaceReader({
      getActor: async () => ({ id: 'user' }),
      readWorkspaces,
    });
    await expect(read()).rejects.toBe(failure);
    expect(readWorkspaces).toHaveBeenCalledTimes(1);
  });
});
