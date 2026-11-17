import { expect, it, vi } from 'vitest';
import { MAIL_SEND_PUBLIC_MESSAGE, MailSendError } from './send-error';

vi.mock('./auth', () => ({
  resolveMailRouteContext: vi.fn(async () => ({ ok: true, context: {} })),
}));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init: ResponseInit) => Response.json(body, init),
  },
}));

it('returns a fixed public send error without provider details', async () => {
  const { withMailContext } = await import('./route-utils');
  const response = await withMailContext(
    {} as Parameters<typeof withMailContext>[0],
    'workspace',
    async () => {
      throw new MailSendError();
    }
  );
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: MAIL_SEND_PUBLIC_MESSAGE,
    code: 'MAIL_SEND_UNCONFIRMED',
  });
});
