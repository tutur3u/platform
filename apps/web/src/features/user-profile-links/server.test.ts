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

  it('rejects phone when the link does not allow it', () => {
    expect(
      findDisallowedFields(['display_name', 'phone'], ['display_name'])
    ).toEqual(['phone']);
  });
});
