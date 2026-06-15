import { describe, expect, it } from 'vitest';
import { buildSanitizedPayload, findDisallowedFields } from './server';

describe('user profile link server helpers', () => {
  it('accepts phone and locks email to the authenticated account', () => {
    const result = buildSanitizedPayload(
      ['display_name', 'email', 'phone'],
      {
        display_name: 'Completed Name',
        email: 'submitted@example.com',
        phone: '+84 900 000 001',
      },
      { actorEmail: 'account@example.com' }
    );

    expect(result.payload).toEqual({
      display_name: 'Completed Name',
      email: 'account@example.com',
      phone: '+84 900 000 001',
    });
    expect(result.submittedFields).toEqual(['display_name', 'email', 'phone']);
  });

  it('accepts the submitted email on no-auth links (lockEmail: false)', () => {
    const result = buildSanitizedPayload(
      ['display_name', 'email'],
      { display_name: 'Anon', email: 'submitted@example.com' },
      { actorEmail: null, lockEmail: false }
    );

    expect(result.payload).toEqual({
      display_name: 'Anon',
      email: 'submitted@example.com',
    });
    expect(result.submittedFields).toEqual(['display_name', 'email']);
  });

  it('ignores a malformed submitted email on no-auth links', () => {
    const result = buildSanitizedPayload(
      ['email'],
      { email: 'not-an-email' },
      { actorEmail: null, lockEmail: false }
    );

    expect(result.payload).toEqual({});
    expect(result.submittedFields).toEqual([]);
  });

  it('clears the email when submitted empty on no-auth links', () => {
    const result = buildSanitizedPayload(
      ['email'],
      { email: '' },
      { actorEmail: null, lockEmail: false }
    );

    expect(result.payload).toEqual({ email: null });
    expect(result.submittedFields).toEqual(['email']);
  });

  it('rejects phone when the link does not allow it', () => {
    expect(
      findDisallowedFields(['display_name', 'phone'], ['display_name'])
    ).toEqual(['phone']);
  });
});
