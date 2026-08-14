import { describe, expect, it } from 'vitest';
import {
  CONTACTS_QUERY_GC_TIME_MS,
  CONTACTS_QUERY_STALE_TIME_MS,
  createContactsQueryClient,
} from './contacts-query-provider';

describe('createContactsQueryClient', () => {
  it('keeps remounted bootstrap queries warm without focus refetches', () => {
    expect(
      createContactsQueryClient().getDefaultOptions().queries
    ).toMatchObject({
      gcTime: CONTACTS_QUERY_GC_TIME_MS,
      refetchOnWindowFocus: false,
      staleTime: CONTACTS_QUERY_STALE_TIME_MS,
    });
  });
});
