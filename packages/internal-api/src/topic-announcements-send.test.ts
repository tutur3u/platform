import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from './internal-api-error';
import {
  sendTopicAnnouncement,
  TopicAnnouncementUnverifiedRecipientsError,
} from './topic-announcements';

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('sendTopicAnnouncement', () => {
  it('returns the delivery receipt on success', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(200, { auditId: 'audit-1', messageId: 'message-1' })
    );

    await expect(
      sendTopicAnnouncement(
        'ws-1',
        'announcement-1',
        {},
        {
          baseUrl: 'https://example.test',
          fetch,
        }
      )
    ).resolves.toEqual({ auditId: 'audit-1', messageId: 'message-1' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/v1/workspaces/ws-1/topic-announcements/announcements/announcement-1/send'
      ),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('exposes unverified recipients when a send is blocked', async () => {
    const unverifiedContacts = [
      { email: 'teacher@example.test', id: 'contact-1', name: 'Teacher' },
    ];
    const fetch = vi.fn(async () =>
      jsonResponse(409, {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'EMAIL_NOT_VERIFIED',
        unverifiedContacts,
      })
    );

    const error = await sendTopicAnnouncement(
      'ws-1',
      'announcement-1',
      {},
      {
        baseUrl: 'https://example.test',
        fetch,
      }
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TopicAnnouncementUnverifiedRecipientsError);
    expect(error).toBeInstanceOf(InternalApiError);
    expect(error).toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
      status: 409,
      unverifiedContacts,
    });
  });

  it('keeps other conflicts as ordinary API errors', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(409, { code: 'ALREADY_SENT', message: 'ALREADY_SENT' })
    );

    const error = await sendTopicAnnouncement(
      'ws-1',
      'announcement-1',
      {},
      {
        baseUrl: 'https://example.test',
        fetch,
      }
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(InternalApiError);
    expect(error).not.toBeInstanceOf(
      TopicAnnouncementUnverifiedRecipientsError
    );
    expect(error).toMatchObject({ message: 'ALREADY_SENT', status: 409 });
  });
});
