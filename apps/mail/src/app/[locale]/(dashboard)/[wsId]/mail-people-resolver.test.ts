import { describe, expect, it, vi } from 'vitest';
import { createPeopleBatcher } from './mail-people-resolver';

vi.mock('@tuturuuu/internal-api/people', () => ({
  resolveWorkspacePeople: vi.fn(),
}));

describe('createPeopleBatcher', () => {
  it('coalesces same-tick lookups into one request per workspace', async () => {
    const resolve = vi.fn(async (_ws: string, emails: string[]) => ({
      data: emails.map((email) => ({
        email,
        kind: 'member' as const,
        id: email,
        displayName: email.split('@')[0] ?? null,
        avatarUrl: null,
        emailVisible: true,
      })),
    }));
    const lookup = createPeopleBatcher(resolve);
    const [a, b, again, other] = await Promise.all([
      lookup('ws1', 'A@x.vn'),
      lookup('ws1', 'b@x.vn'),
      lookup('ws1', 'a@x.vn '),
      lookup('ws2', 'a@x.vn'),
    ]);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledWith('ws1', ['a@x.vn', 'b@x.vn']);
    expect(a.displayName).toBe('a');
    expect(again).toEqual(a);
    expect(b.email).toBe('b@x.vn');
    expect(other.email).toBe('a@x.vn');
  });

  it('splits large batches and fills missing rows as unknown', async () => {
    const resolve = vi.fn(async () => ({ data: [] }));
    const lookup = createPeopleBatcher(resolve);
    const people = await Promise.all(
      Array.from({ length: 120 }, (_, i) => lookup('ws', `u${i}@x.vn`))
    );
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(
      people.every((person: { kind: string }) => person.kind === 'unknown')
    ).toBe(true);
  });

  it('rejects every waiter of a failed chunk', async () => {
    const lookup = createPeopleBatcher(async () => {
      throw new Error('down');
    });
    await expect(lookup('ws', 'a@x.vn')).rejects.toThrow('down');
  });
});
