import { describe, expect, it } from 'vitest';
import { createContactsQueryClient } from './contacts-query-provider';

describe('createContactsQueryClient', () => {
  it('keeps remounted bootstrap queries warm without focus refetches', () => {
    expect(
      createContactsQueryClient().getDefaultOptions().queries
    ).toMatchObject({
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60_000,
    });
  });
});
