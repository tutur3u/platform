import {
  connectedMailRequest,
  createInternalApiClient,
  listMailMessages,
} from '@tuturuuu/internal-api';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailApiOptions, mailApiPath } from './mail-api-options';

afterEach(() => vi.unstubAllGlobals());
describe('mounted Mail client transport', () => {
  it('sends actual typed Mail clients to their own mount and leaves Web APIs at root', async () => {
    vi.stubGlobal('__tuturuuuAppBase', '/mail');
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ messages: [] })
    );
    const options = { ...mailApiOptions, fetch };
    await listMailMessages('workspace', 'mailbox', {}, options);
    await connectedMailRequest(
      'workspace',
      ['account', 'messages'],
      {},
      options
    );
    await createInternalApiClient(options).json('/api/v1/users/me/profile');
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/mail/api/v1/workspaces/workspace/mail/mailboxes/mailbox/messages',
      '/mail/api/v1/workspaces/workspace/mail/connected/account/messages',
      '/api/v1/users/me/profile',
    ]);
    expect(withAppBase('/api/v1/workspaces/ws/mail/attachments/file')).toBe(
      '/mail/api/v1/workspaces/ws/mail/attachments/file'
    );
  });
  it.each(['', '/mail'])(
    'resolves every Mail family per request at base %j',
    (base) => {
      vi.stubGlobal('__tuturuuuAppBase', base);
      for (const path of [
        '/api/v1/workspaces/ws/mail/messages?cursor=a%2Bb',
        '/api/v1/mail/domains',
        '/api/ai/email-draft',
        '/api/auth/refresh-app-session',
      ])
        expect(mailApiPath(path)).toBe(`${base}${path}`);
      for (const path of [
        '/api/v1/users/me/profile',
        '/api/v1/workspaces/ws/mailing',
        'https://provider.test/attachment',
      ])
        expect(mailApiPath(path)).toBe(path);
    }
  );
});
