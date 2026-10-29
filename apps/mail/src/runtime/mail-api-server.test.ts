import { listMailMessages } from '@tuturuuu/internal-api';
import { withBridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { afterEach, expect, it, vi } from 'vitest';
import { registerMailServerApiPaths } from './mail-api-server';

afterEach(() => vi.unstubAllGlobals());
it('resolves shared clients from each overlapping request rather than capturing the first host', async () => {
  vi.stubGlobal('window', undefined);
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ messages: [] })
  );
  vi.stubGlobal('fetch', fetch);
  const unregister = registerMailServerApiPaths();
  try {
    await Promise.all(
      (
        [
          ['https://mail.tuturuuu.com/personal/inbox', ''],
          ['https://tuturuuu.com/mail/personal/inbox', '/mail'],
        ] satisfies [string, string][]
      ).map(([url, appBase]) =>
        withBridgeRequest({ request: new Request(url), appBase }, async () => {
          await Promise.resolve();
          await listMailMessages('workspace', 'mailbox');
        })
      )
    );
    expect(fetch.mock.calls.map(([path]) => path).sort()).toEqual([
      'https://mail.tuturuuu.com/api/v1/workspaces/workspace/mail/mailboxes/mailbox/messages',
      'https://tuturuuu.com/mail/api/v1/workspaces/workspace/mail/mailboxes/mailbox/messages',
    ]);
  } finally {
    unregister();
  }
});
