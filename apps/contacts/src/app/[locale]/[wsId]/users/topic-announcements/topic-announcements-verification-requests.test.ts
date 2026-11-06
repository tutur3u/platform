import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';
import {
  getContactsNeedingVerification,
  getUnverifiedRecipientsFromError,
  requestTopicAnnouncementVerifications,
} from './topic-announcements-verification-requests';

describe('topic announcement verification requests', () => {
  it('reads unverified recipients only from a blocked send', () => {
    const blocked = Object.assign(
      new InternalApiError('EMAIL_NOT_VERIFIED', 409, 'EMAIL_NOT_VERIFIED'),
      {
        unverifiedContacts: [
          { email: 'teacher@example.test', id: 'a', name: 'Teacher' },
        ],
      }
    );

    expect(getUnverifiedRecipientsFromError(blocked)).toEqual([
      { email: 'teacher@example.test', id: 'a', name: 'Teacher' },
    ]);
    expect(
      getUnverifiedRecipientsFromError(
        new InternalApiError('ALREADY_SENT', 409, 'ALREADY_SENT')
      )
    ).toBeNull();
    expect(getUnverifiedRecipientsFromError(new Error('boom'))).toBeNull();
  });

  it('selects active contacts that still need to verify', () => {
    expect(
      getContactsNeedingVerification([
        { archived: false, id: 'a', verificationStatus: 'needs_verification' },
        { archived: false, id: 'b', verificationStatus: 'pending' },
        { archived: false, id: 'c', verificationStatus: 'verified' },
        {
          archived: false,
          id: 'd',
          verificationStatus: 'linked_confirmed_account',
        },
        { archived: true, id: 'e', verificationStatus: 'needs_verification' },
      ]).map((contact) => contact.id)
    ).toEqual(['a', 'b']);
  });

  it('counts sent and pending links once per contact', async () => {
    const request = vi.fn(async (contactId: string) => ({
      alreadyPending: contactId === 'b',
    }));

    await expect(
      requestTopicAnnouncementVerifications(['a', 'b', 'a'], request)
    ).resolves.toEqual({
      alreadyPending: 1,
      failed: 0,
      rateLimited: 0,
      sent: 1,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('stops at the first rate limit and reports the remaining contacts', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ alreadyPending: false })
      .mockRejectedValueOnce(new InternalApiError('RATE_LIMITED', 429))
      .mockResolvedValue({ alreadyPending: false });

    await expect(
      requestTopicAnnouncementVerifications(['a', 'b', 'c', 'd'], request)
    ).resolves.toEqual({
      alreadyPending: 0,
      failed: 0,
      rateLimited: 3,
      sent: 1,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('continues past other failures', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new InternalApiError('Not found', 404))
      .mockResolvedValueOnce({ alreadyPending: false });

    await expect(
      requestTopicAnnouncementVerifications(['a', 'b'], request)
    ).resolves.toEqual({
      alreadyPending: 0,
      failed: 1,
      rateLimited: 0,
      sent: 1,
    });
  });
});
