import { describe, expect, it, vi } from 'vitest';
import { getContactVerificationStatuses } from './email';
import { hashVerificationToken } from './shared';

function verificationQuery(data: unknown[]) {
  return {
    in: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data, error: null })),
    select: vi.fn().mockReturnThis(),
  };
}

describe('topic announcement email helpers', () => {
  it('hashes verification tokens deterministically without leaking raw tokens', () => {
    expect(hashVerificationToken('token-a')).toBe(
      hashVerificationToken('token-a')
    );
    expect(hashVerificationToken('token-a')).not.toBe('token-a');
  });

  it('prefers linked confirmed accounts over pending internal verification', async () => {
    const sbAdmin = {
      from: vi.fn(() =>
        verificationQuery([
          {
            contact_id: 'contact-1',
            expires_at: '2999-01-01T00:00:00.000Z',
            status: 'pending',
          },
          {
            contact_id: 'contact-2',
            expires_at: '2999-01-01T00:00:00.000Z',
            status: 'verified',
          },
        ])
      ),
      rpc: vi.fn(async (_name: string, args: { p_contact_id: string }) => ({
        data: args.p_contact_id === 'contact-1',
        error: null,
      })),
    };

    const statuses = await getContactVerificationStatuses(sbAdmin, [
      'contact-1',
      'contact-2',
      'contact-3',
    ]);

    expect(statuses.get('contact-1')).toBe('linked_confirmed_account');
    expect(statuses.get('contact-2')).toBe('verified');
    expect(statuses.get('contact-3')).toBe('needs_verification');
  });
});
