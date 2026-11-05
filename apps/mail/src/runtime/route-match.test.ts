import { matchRoute, routeParam } from '@tuturuuu/start-bridge/route-match';
import { describe, expect, it } from 'vitest';

describe('Mail route parameters', () => {
  it('keeps workspace, mailbox, message and attachment identity separate', () => {
    const pattern =
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/attachments/[attachmentId]';
    expect(
      matchRoute(
        pattern,
        '/api/v1/workspaces/tenant/mail/mailboxes/box/messages/message/attachments/object'
      )
    ).toEqual({
      wsId: 'tenant',
      mailboxId: 'box',
      messageId: 'message',
      attachmentId: 'object',
    });
    expect(
      matchRoute(
        pattern,
        '/api/v1/workspaces/tenant/mail/mailboxes/box/messages/message/attachments/object/extra'
      )
    ).toBeNull();
    expect(
      matchRoute(
        pattern,
        '/api/v1/workspaces/tenant/mail/mailboxes/box/messages/message/attachments'
      )
    ).toBeNull();
  });
  it('retains connected-mail optional paths and decoded segments', () => {
    const pattern = '/api/v1/workspaces/[wsId]/mail/connected/[[...segments]]';
    expect(
      matchRoute(pattern, '/api/v1/workspaces/tenant/mail/connected')
    ).toEqual({ wsId: 'tenant', segments: [] });
    expect(
      matchRoute(
        pattern,
        '/api/v1/workspaces/tenant/mail/connected/accounts/a%20b'
      )
    ).toEqual({ wsId: 'tenant', segments: ['accounts', 'a b'] });
    expect(() =>
      matchRoute(pattern, '/api/v1/workspaces/tenant/mail/connected/%ZZ')
    ).toThrow(URIError);
    expect(() => routeParam({ segments: [] }, 'segments')).toThrow(
      'Missing route parameter'
    );
  });
});
