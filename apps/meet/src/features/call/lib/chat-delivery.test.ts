import { expect, it, vi } from 'vitest';
import { sendRecoverableChat } from './chat-delivery';

it('reuses the message ID when the acknowledgement is lost', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('signaling_timeout'))
    .mockResolvedValue({ id: 'saved' });
  expect(
    await sendRecoverableChat(
      { request, isClosed: false },
      'Hello',
      [],
      async () => {}
    )
  ).toEqual({ id: 'saved' });
  expect(request.mock.calls[0]?.[0]).toEqual(request.mock.calls[1]?.[0]);
});
it('does not retry rejected messages', async () => {
  const request = vi.fn().mockRejectedValue(new Error('permission_denied'));
  await expect(
    sendRecoverableChat({ request, isClosed: false }, 'Hello')
  ).rejects.toThrow('permission_denied');
  expect(request).toHaveBeenCalledTimes(1);
});
