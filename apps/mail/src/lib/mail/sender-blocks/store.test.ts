import { describe, expect, it, vi } from 'vitest';

vi.mock('../repository/bootstrap', () => ({ requireMailboxAccess: vi.fn() }));

import { isSenderBlocked } from './store';

function adminReturning(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown]> = [];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      calls.push([column, value]);
      return builder;
    },
    in: (column: string, values: unknown) => {
      calls.push([column, values]);
      return Promise.resolve(result);
    },
  };
  return {
    calls,
    admin: { schema: () => ({ from: () => builder }) },
  };
}

describe('isSenderBlocked', () => {
  it('looks up only this mailbox and the sender candidates', async () => {
    const { admin, calls } = adminReturning({
      data: [{ kind: 'domain', value: 'sepay.vn' }],
      error: null,
    });
    await expect(
      isSenderBlocked(admin, 'mailbox-1', 'team@mail.sepay.vn')
    ).resolves.toBe(true);
    expect(calls).toEqual([
      ['mailbox_id', 'mailbox-1'],
      ['value', ['team@mail.sepay.vn', 'mail.sepay.vn', 'sepay.vn']],
    ]);
  });

  it('ignores rows that do not match the sender', async () => {
    const { admin } = adminReturning({
      data: [{ kind: 'address', value: 'sepay.vn' }],
      error: null,
    });
    await expect(isSenderBlocked(admin, 'm', 'team@sepay.vn')).resolves.toBe(
      false
    );
  });

  it('delivers to the inbox when the lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { admin } = adminReturning({ data: null, error: new Error('down') });
    await expect(isSenderBlocked(admin, 'm', 'team@sepay.vn')).resolves.toBe(
      false
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips the lookup for a missing or malformed sender', async () => {
    const { admin, calls } = adminReturning({ data: [], error: null });
    await expect(isSenderBlocked(admin, 'm', null)).resolves.toBe(false);
    await expect(isSenderBlocked(admin, 'm', 'nope')).resolves.toBe(false);
    expect(calls).toEqual([]);
  });
});
