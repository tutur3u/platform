import type { MailCorrespondent } from '@tuturuuu/internal-api';
import type { WorkspacePerson } from '@tuturuuu/internal-api/people';
import { describe, expect, it } from 'vitest';
import {
  isMultiAddressInput,
  mergeRecipientSuggestions,
  typedAddressOption,
} from './recipient-ranking';

const recent = (
  email: string,
  score: number,
  name: string | null = null
): MailCorrespondent => ({
  email,
  name,
  score,
  lastAt: '2026-11-16T00:00:00.000Z',
  direction: 'outbound',
});
const member = (
  id: string,
  email: string | null,
  displayName: string
): WorkspacePerson => ({
  id,
  kind: 'member',
  email,
  displayName,
  avatarUrl: null,
});
const contact = (
  id: string,
  email: string,
  displayName: string
): WorkspacePerson => ({
  id,
  kind: 'contact',
  linkedUserId: null,
  email,
  displayName,
  avatarUrl: null,
});

describe('mergeRecipientSuggestions', () => {
  it('dedupes by lowercase email, keeping the strongest kind and the recent score', () => {
    const rows = mergeRecipientSuggestions({
      recent: [recent('Tam@X.vn', 3, 'Tâm')],
      people: [
        contact('c1', 'tam@x.vn', 'Tâm C'),
        member('m1', 'TAM@x.vn', 'Tâm Nguyễn'),
      ],
      query: 'tam',
      excludedAddresses: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'member',
      email: 'tam@x.vn',
      name: 'Tâm Nguyễn',
      score: 3,
    });
  });

  it('ranks by match quality, then score, then kind', () => {
    const rows = mergeRecipientSuggestions({
      recent: [
        recent('phuc.tran@sepay.vn', 5, 'Phúc Trần'),
        recent('aphuc@vercel.com', 9),
      ],
      people: [
        member('m1', 'an@x.vn', 'Nguyễn Phúc An'),
        contact('c1', 'hp@x.vn', 'Hoàng Phúc'),
      ],
      query: 'phuc',
      excludedAddresses: [],
    });
    expect(rows.map((row) => row.email)).toEqual([
      'phuc.tran@sepay.vn',
      'an@x.vn',
      'hp@x.vn',
      'aphuc@vercel.com',
    ]);
  });

  it('keeps hidden-email members as rows without an address', () => {
    const rows = mergeRecipientSuggestions({
      recent: [],
      people: [member('m2', null, 'Hoàng Phúc')],
      query: 'phuc',
      excludedAddresses: [],
    });
    expect(rows).toEqual([
      expect.objectContaining({ key: 'member:m2', email: null }),
    ]);
  });

  it('drops excluded addresses and caps the list at six rows', () => {
    const rows = mergeRecipientSuggestions({
      recent: Array.from({ length: 10 }, (_, index) =>
        recent(`p${index}@x.vn`, 10 - index)
      ),
      people: [],
      query: '',
      excludedAddresses: ['P0@x.vn'],
    });
    expect(rows).toHaveLength(6);
    expect(rows[0]!.email).toBe('p1@x.vn');
  });
});

describe('typedAddressOption', () => {
  it('offers a single valid address that is not already suggested', () => {
    expect(typedAddressOption('lan.nguyen@acme.vn', [])).toEqual({
      address: 'lan.nguyen@acme.vn',
      displayName: null,
    });
    expect(typedAddressOption('lan ng', [])).toBeNull();
    expect(typedAddressOption('a@x.vn, b@x.vn', [])).toBeNull();
    const rows = mergeRecipientSuggestions({
      recent: [recent('lan@acme.vn', 1)],
      people: [],
      query: 'lan@acme.vn',
      excludedAddresses: [],
    });
    expect(typedAddressOption('lan@acme.vn', rows)).toBeNull();
  });

  it('detects multi-address input', () => {
    expect(isMultiAddressInput('a@x.vn, b@x.vn')).toBe(true);
    expect(isMultiAddressInput('Tâm <t@x.vn>')).toBe(true);
    expect(isMultiAddressInput('phuc')).toBe(false);
  });
});
