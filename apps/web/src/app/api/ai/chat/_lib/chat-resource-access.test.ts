import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceAdmin,
  OTHER_CHAT,
  OTHER_THREAD,
  OWN_CHAT,
  OWN_THREAD,
  type ResourceAdminState,
  seedResourceAdminState,
  UNKNOWN_ID,
} from './resource-admin.test-fixture';

const state = vi.hoisted(() => ({}) as ResourceAdminState);

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => createResourceAdmin(state).client,
}));

import {
  parseAiChatResourcePath,
  resolveAiChatResourceOwner,
  verifyAiChatResourceScopes,
} from './chat-resource-access';

function scopes(...paths: string[]) {
  return paths.map((path) => parseAiChatResourcePath(path)!);
}

describe('AI chat resource access', () => {
  beforeEach(() => seedResourceAdminState(state));

  it('parses chat and temp resource paths and rejects traversal', () => {
    expect(
      parseAiChatResourcePath(`ws/chats/ai/resources/${OWN_CHAT}/a.jpg`)
    ).toEqual({ kind: 'chat', chatId: OWN_CHAT, wsId: 'ws' });
    expect(
      parseAiChatResourcePath('ws/chats/ai/resources/temp/actor/a.jpg')
    ).toEqual({ kind: 'temp', userId: 'actor', wsId: 'ws' });
    expect(
      parseAiChatResourcePath(`ws/chats/ai/resources/${OWN_CHAT}/../x.jpg`)
    ).toBeNull();
    expect(
      parseAiChatResourcePath(`ws/chats/ai/resources/${OWN_CHAT}`)
    ).toBeNull();
    expect(parseAiChatResourcePath('ws/mira/images/a.png')).toBeNull();
  });

  it("denies another member's chat, Mind thread and temp folder", async () => {
    for (const path of [
      `ws-1/chats/ai/resources/${OTHER_CHAT}/a.jpg`,
      `ws-1/chats/ai/resources/${OTHER_THREAD}/a.jpg`,
      'ws-1/chats/ai/resources/temp/other-member/a.jpg',
    ]) {
      await expect(
        verifyAiChatResourceScopes({ scopes: scopes(path), userId: 'actor' })
      ).resolves.toBe('not_found');
    }
  });

  it('denies folders with no owning record', async () => {
    await expect(
      verifyAiChatResourceScopes({
        scopes: scopes(`ws-1/chats/ai/resources/${UNKNOWN_ID}/a.jpg`),
        userId: 'actor',
      })
    ).resolves.toBe('not_found');
  });

  it("denies the actor's own Mind thread under another workspace", async () => {
    await expect(
      verifyAiChatResourceScopes({
        scopes: scopes(`ws-2/chats/ai/resources/${OWN_THREAD}/a.jpg`),
        userId: 'actor',
      })
    ).resolves.toBe('not_found');
  });

  it('denies a Mind thread whose creator was removed', async () => {
    state.threads[0]!.creator_id = null;
    await expect(
      verifyAiChatResourceScopes({
        scopes: scopes(`ws-1/chats/ai/resources/${OWN_THREAD}/a.jpg`),
        userId: 'actor',
      })
    ).resolves.toBe('not_found');
  });

  it('allows own chats, own Mind threads and own temp files', async () => {
    await expect(
      verifyAiChatResourceScopes({
        scopes: scopes(
          `ws-1/chats/ai/resources/${OWN_CHAT}/a.jpg`,
          `ws-1/chats/ai/resources/${OWN_THREAD}/a.jpg`,
          'ws-1/chats/ai/resources/temp/actor/a.jpg'
        ),
        userId: 'actor',
      })
    ).resolves.toBe('allowed');
  });

  it('resolves the owning resource kind', async () => {
    const resolve = (chatId: string) =>
      resolveAiChatResourceOwner({ chatId, userId: 'actor', wsId: 'ws-1' });
    await expect(resolve(OWN_CHAT)).resolves.toEqual({
      access: 'allowed',
      owner: { kind: 'ai_chat' },
    });
    await expect(resolve(OWN_THREAD)).resolves.toEqual({
      access: 'allowed',
      owner: { kind: 'mind_thread' },
    });
    await expect(resolve(UNKNOWN_ID)).resolves.toEqual({
      access: 'allowed',
      owner: { kind: 'unknown' },
    });
  });

  it('fails closed when the ownership lookup errors', async () => {
    state.lookupError = { message: 'boom' };
    await expect(
      verifyAiChatResourceScopes({
        scopes: scopes(`ws-1/chats/ai/resources/${OWN_CHAT}/a.jpg`),
        userId: 'actor',
      })
    ).resolves.toBe('lookup_failed');
  });
});
