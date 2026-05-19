import { describe, expect, it, vi } from 'vitest';
import { serializeTopicAnnouncementContacts } from './shared';

function verificationQuery(data: unknown[]) {
  return {
    in: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data, error: null })),
    select: vi.fn().mockReturnThis(),
  };
}

describe('serializeTopicAnnouncementContacts', () => {
  it('attaches verification status for announcement recipients', async () => {
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

    const contacts = await serializeTopicAnnouncementContacts(sbAdmin, [
      {
        archived: false,
        created_at: '2026-05-19T00:00:00.000Z',
        email: 'teacher@example.com',
        id: 'contact-1',
        metadata: {},
        name: 'Teacher One',
        tags: [],
        workspace_user_id: 'user-1',
      },
      {
        archived: false,
        created_at: '2026-05-19T00:00:00.000Z',
        email: 'teacher2@example.com',
        id: 'contact-2',
        metadata: {},
        name: 'Teacher Two',
        tags: [],
        workspace_user_id: null,
      },
    ]);

    expect(contacts[0]?.verificationStatus).toBe('linked_confirmed_account');
    expect(contacts[1]?.verificationStatus).toBe('verified');
  });
});
