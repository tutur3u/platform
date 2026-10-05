import { beforeEach, describe, expect, it, vi } from 'vitest';

const { read, entries } = vi.hoisted(() => ({
  read: vi.fn(),
  entries: new Map<string, unknown>(),
}));
vi.mock('../workspace-helper', () => ({ getWorkspace: read }));
// One request's cache tests primitive identity keys. React owns its lifetime.
vi.mock('react', () => ({
  cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!entries.has(key)) entries.set(key, fn(...args));
      return entries.get(key);
    },
}));

import { getRequestWorkspace } from '../request-workspace';

describe('request workspace identity', () => {
  beforeEach(() => {
    entries.clear();
    read.mockReset();
    read.mockResolvedValue({ id: 'workspace' });
  });
  it('coalesces equal principals supplied as separate objects', async () => {
    await Promise.all([
      getRequestWorkspace('personal', {
        useAdmin: true,
        user: { id: 'actor' },
      }),
      getRequestWorkspace('personal', {
        useAdmin: true,
        user: { id: 'actor' },
      }),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('personal', {
      useAdmin: true,
      user: { id: 'actor', email: null },
    });
  });
  it('separates actors, emails, workspace identifiers and access modes', async () => {
    const user = { id: 'actor', email: 'actor@example.test' };
    await getRequestWorkspace('personal', { user });
    await getRequestWorkspace('personal', { user: { ...user, id: 'other' } });
    await getRequestWorkspace('personal', { user: { ...user, email: null } });
    await getRequestWorkspace('other', { user });
    await getRequestWorkspace('personal', { useAdmin: true, user });
    expect(read).toHaveBeenCalledTimes(5);
  });
  it('leaves authentication to the existing reader without a principal', async () => {
    await getRequestWorkspace('personal');
    expect(read).toHaveBeenCalledWith('personal', { useAdmin: false });
  });
  it('does not retain results in the next simulated request', async () => {
    await getRequestWorkspace('personal');
    entries.clear();
    await getRequestWorkspace('personal');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
