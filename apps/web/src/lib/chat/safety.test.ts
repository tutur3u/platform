import { describe, expect, it, vi } from 'vitest';
import {
  hideBlockedMessageContent,
  hideBlockedPreviews,
  hideBlockedReactors,
  hideBlockedReactorsAfterWrite,
  loadChatBlockedUserIdsForWrite,
} from './safety';

vi.mock('server-only', () => ({}));

const callPrivateChatRpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/chat/private-rpc', () => ({ callPrivateChatRpc }));

const blocked = new Set(['blocked']);

function message(
  id: string,
  senderId: string | null,
  reactions = [
    { count: 2, emoji: 'x', userIds: ['friend', 'blocked'] },
    { count: 1, emoji: 'y', userIds: ['blocked'] },
  ]
) {
  return { id, reactions, senderId };
}

describe('hideBlockedReactors', () => {
  it('removes blocked reactors and drops summaries left empty', () => {
    expect(hideBlockedReactors(message('m1', 'friend'), blocked)).toEqual({
      id: 'm1',
      reactions: [{ count: 1, emoji: 'x', userIds: ['friend'] }],
      senderId: 'friend',
    });
  });

  it('returns the same message when nobody is blocked', () => {
    const original = message('m1', 'friend');
    expect(hideBlockedReactors(original, new Set())).toBe(original);
  });
});

describe('hideBlockedMessageContent', () => {
  it('drops blocked senders and scrubs reactions on the rest', () => {
    const result = hideBlockedMessageContent(
      [message('m1', 'friend'), message('m2', 'blocked'), message('m3', null)],
      blocked
    );

    expect(result.map((item) => item.id)).toEqual(['m1', 'm3']);
    for (const item of result) {
      expect(item.reactions.flatMap((reaction) => reaction.userIds)).toEqual([
        'friend',
      ]);
    }
  });
});

describe('hideBlockedPreviews', () => {
  it('drops a blocked preview and scrubs reactions on a kept one', () => {
    const [fromBlocked, fromFriend, empty] = hideBlockedPreviews(
      [
        { id: 'c1', latestMessage: message('m1', 'blocked') },
        { id: 'c2', latestMessage: message('m2', 'friend') },
        { id: 'c3', latestMessage: null },
      ],
      blocked
    );

    expect(fromBlocked?.latestMessage).toBeNull();
    expect(fromFriend?.latestMessage?.reactions).toEqual([
      { count: 1, emoji: 'x', userIds: ['friend'] },
    ]);
    expect(empty?.latestMessage).toBeNull();
  });
});

describe('write responses', () => {
  it('hides blocked reactors when the lookup succeeds', async () => {
    callPrivateChatRpc.mockResolvedValueOnce([{ userId: 'blocked' }]);
    const lookup = await loadChatBlockedUserIdsForWrite('reader');

    expect(
      hideBlockedReactorsAfterWrite(message('m1', 'friend'), lookup).reactions
    ).toEqual([{ count: 1, emoji: 'x', userIds: ['friend'] }]);
  });

  it('returns no reactions when the lookup fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    callPrivateChatRpc.mockRejectedValueOnce(new Error('rpc_down'));
    const lookup = await loadChatBlockedUserIdsForWrite('reader');

    expect(lookup).toBeNull();
    expect(
      hideBlockedReactorsAfterWrite(message('m1', 'friend'), lookup).reactions
    ).toEqual([]);
  });
});
