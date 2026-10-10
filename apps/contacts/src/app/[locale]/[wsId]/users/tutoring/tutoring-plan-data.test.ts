import { describe, expect, it, vi } from 'vitest';
import { completeTutoringPages } from './tutoring-plan-data';

function page(current: number, count: number) {
  return {
    page: current,
    pageSize: 100,
    count,
    totalPages: Math.ceil(count / 100),
    data: Array.from(
      { length: Math.min(100, Math.max(0, count - (current - 1) * 100)) },
      (_, i) => ({ id: String((current - 1) * 100 + i) })
    ),
  };
}
describe('complete bounded planning reads', () => {
  it('reads every page, beyond the visible UI page', async () => {
    const read = vi.fn(async (n) => page(n, 201));
    expect(await completeTutoringPages(read, () => true)).toHaveLength(201);
    expect(read.mock.calls).toEqual([[1], [2], [3]]);
  });
  it('treats successful empty catalog distinctly', async () =>
    expect(
      await completeTutoringPages(
        async () => page(1, 0),
        () => true
      )
    ).toEqual([]));
  it.each(['count', 'totalPages', 'page', 'pageSize'] as const)(
    'rejects inconsistent %s metadata',
    async (field) => {
      await expect(
        completeTutoringPages(
          async () => ({ ...page(1, 101), [field]: -1 }),
          () => true
        )
      ).rejects.toThrow('Incomplete');
    }
  );
  it('denies truncation, duplicates and changing catalog counts', async () => {
    await expect(
      completeTutoringPages(
        async () => ({ ...page(1, 101), data: [] }),
        () => true
      )
    ).rejects.toThrow('Incomplete');
    await expect(
      completeTutoringPages(
        async (n) =>
          n === 1 ? page(n, 101) : { ...page(n, 101), data: [{ id: '0' }] },
        () => true
      )
    ).rejects.toThrow('Incomplete');
    await expect(
      completeTutoringPages(
        async (n) => page(n, n === 1 ? 101 : 102),
        () => true
      )
    ).rejects.toThrow('Incomplete');
  });
  it('refuses overlimit catalog before following pages', async () => {
    const read = vi.fn(async () => page(1, 2001));
    await expect(completeTutoringPages(read, () => true)).rejects.toThrow(
      'Incomplete'
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('stops old scope before another page request', async () => {
    let current = true;
    const read = vi.fn(async (n) => {
      current = false;
      return page(n, 101);
    });
    await expect(completeTutoringPages(read, () => current)).rejects.toThrow(
      'Scope expired'
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('propagates errors instead of inferring empty availability', async () => {
    await expect(
      completeTutoringPages(
        async () => {
          throw new Error('synthetic failure');
        },
        () => true
      )
    ).rejects.toThrow('synthetic failure');
  });
});
