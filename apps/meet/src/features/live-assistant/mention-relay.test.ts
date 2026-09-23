import { expect, it, vi } from 'vitest';
import type { CallChatMessage } from '../call/lib/call-state';
import { MiraMentionRelay } from './mention-relay';

const message = (id: string, extra = {}) =>
  ({
    id,
    body: '@mira summarize',
    displayName: 'Sam',
    userId: 'sam',
    createdAt: '',
    ...extra,
  }) as CallChatMessage;
it('queues fresh mentions during recovery, retries blocked sends, and skips history and assistant replies', () => {
  const relay = new MiraMentionRelay();
  const old = message('old');
  relay.observe([old], false);
  relay.observe(
    [
      old,
      message('new'),
      message('replay', { replayed: true }),
      message('assistant', { assistant: true }),
    ],
    true
  );
  const blocked = vi.fn(() => false);
  relay.flush(blocked);
  const send = vi.fn(() => true);
  relay.flush(send);
  relay.flush(send);
  expect(send).toHaveBeenCalledExactlyOnceWith('Sam: @mira summarize');
});
it('clears pending room questions when stopping or switching to private mode', () => {
  const relay = new MiraMentionRelay();
  relay.observe([message('new')], true);
  relay.observe([message('new')], false);
  const send = vi.fn(() => true);
  relay.flush(send);
  expect(send).not.toHaveBeenCalled();
});
