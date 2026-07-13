import { describe, expect, it } from 'vitest';
import {
  getMailThreadsQueryKey,
  getNextMailThreadPage,
} from './mail-thread-query';

describe('mail thread query helpers', () => {
  it('keeps folder caches stable and isolated', () => {
    expect(
      getMailThreadsQueryKey({
        folder: 'archive',
        mailboxId: 'mailbox-1',
        workspaceId: 'personal',
      })
    ).toEqual([
      'mail',
      'personal',
      'mailbox-1',
      'threads',
      'archive',
      null,
      null,
      '',
    ]);
  });

  it('returns the next page only while rows remain', () => {
    const response = (page: number, total: number) =>
      ({ pagination: { page, pageSize: 40, total } }) as never;

    expect(getNextMailThreadPage(response(1, 41))).toBe(2);
    expect(getNextMailThreadPage(response(2, 41))).toBeUndefined();
  });
});
