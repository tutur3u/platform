import type { TopicAnnouncementContact } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  resolveExistingContactSelection,
  sanitizeContactSearch,
} from './existing-contact-selection';

const base: TopicAnnouncementContact = {
  archived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  email: 'lan@example.com',
  id: 'contact-lan',
  metadata: {},
  name: 'Lan Nguyen',
  tags: [],
  verificationStatus: 'verified',
  workspaceUserId: 'user-lan',
};

describe('resolveExistingContactSelection', () => {
  it('returns the exact workspace contact', () => {
    expect(resolveExistingContactSelection([base], 'contact-lan')).toEqual({
      contact: base,
      ok: true,
    });
  });

  it('rejects a contact outside the workspace results', () => {
    expect(resolveExistingContactSelection([base], 'contact-other')).toEqual({
      ok: false,
      reason: 'foreign',
    });
  });

  it('rejects archived and email-less contacts', () => {
    expect(
      resolveExistingContactSelection(
        [{ ...base, archived: true }],
        'contact-lan'
      )
    ).toEqual({ ok: false, reason: 'archived' });
    expect(
      resolveExistingContactSelection([{ ...base, email: ' ' }], 'contact-lan')
    ).toEqual({ ok: false, reason: 'missing_email' });
  });
});

describe('sanitizeContactSearch', () => {
  it('drops PostgREST filter syntax from the query', () => {
    expect(sanitizeContactSearch(' Lan,archived.eq.true(x) ')).toBe(
      'Lan archived.eq.true x'
    );
  });
});
