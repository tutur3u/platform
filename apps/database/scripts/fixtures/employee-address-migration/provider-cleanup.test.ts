// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assertGoogleProviderResourcesAbsent,
  cleanupGoogleProvider,
  googleProviderResources,
} from './provider-cleanup';

const suffix = '11111111-1111-4111-8111-111111111111';
function fixture(foreign = false, unknown = false) {
  const names = googleProviderResources(suffix);
  const rows = new Map<string, unknown>([
    [
      names.auth,
      {
        Id: 'auth-id',
        Name: `/${names.auth}`,
        Config: {
          Labels: {
            'employee-gotrue-qualification': foreign ? 'other-run' : suffix,
          },
        },
        Mounts: [],
      },
    ],
    [
      names.database,
      {
        Id: 'db-id',
        Name: `/${names.database}`,
        Config: { Labels: { 'employee-gotrue-qualification': suffix } },
        Mounts: [],
      },
    ],
    [
      names.network,
      { Id: 'network-id', Labels: { 'employee-gotrue-qualification': suffix } },
    ],
  ]);
  const removed: string[] = [];
  const execute = async (args: string[]) => {
    const [kind, action, name] = args;
    if (action === 'inspect' && name) {
      if (unknown) throw { code: 1, stderr: 'daemon unreachable' };
      const row = rows.get(name);
      if (row) return { stdout: JSON.stringify([row]) };
      throw { code: 1, stderr: `Error: No such ${kind}: ${name}` };
    }
    const id = kind === 'rm' ? args[3] : name;
    if (id === 'auth-id') rows.delete(names.auth);
    if (id === 'db-id') rows.delete(names.database);
    if (id === 'network-id') rows.delete(names.network);
    if (id) removed.push(id);
    return { stdout: '' };
  };
  return { execute, removed, rows };
}
describe('owned Google fixture cleanup', () => {
  it('removes only exact run-owned containers and network then independently observes absence', async () => {
    const f = fixture();
    expect((await cleanupGoogleProvider(f.execute, suffix)).absent).toBe(true);
    expect(f.removed).toEqual(['auth-id', 'db-id', 'network-id']);
    await expect(
      assertGoogleProviderResourcesAbsent(f.execute, suffix)
    ).resolves.toBeUndefined();
  });
  it('retains a foreign-labeled resource and reports cleanup failure', async () => {
    const f = fixture(true);
    expect((await cleanupGoogleProvider(f.execute, suffix)).absent).toBe(false);
    expect(f.removed).not.toContain('auth-id');
    await expect(
      assertGoogleProviderResourcesAbsent(f.execute, suffix)
    ).rejects.toThrow();
  });
  it('does not reinterpret unknown daemon outcomes as absence', async () => {
    const f = fixture(false, true);
    expect((await cleanupGoogleProvider(f.execute, suffix)).absent).toBe(false);
    expect(f.removed).toEqual([]);
  });
  it('does not accept a null inspect row as authoritative absence', async () => {
    const execute = async () => ({ stdout: '[null]' });
    expect((await cleanupGoogleProvider(execute, suffix)).absent).toBe(false);
    await expect(
      assertGoogleProviderResourcesAbsent(execute, suffix)
    ).rejects.toThrow();
  });
});
