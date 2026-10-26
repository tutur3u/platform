import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseAiChatResourcePath,
  resolveAiChatResourceAccess,
  resolveAiChatUploadFolder,
} from './chat-resource-ownership';
import {
  createResourceAdmin,
  OTHER_CHAT,
  OTHER_THREAD,
  OWN_CHAT,
  OWN_THREAD,
  type ResourceAdminState,
  seedResourceAdminState,
  UNKNOWN_ID,
  WS,
} from './resource-admin.test-fixture';

const state = {} as ResourceAdminState;
const admin = () => createResourceAdmin(state).client as never;

describe('AI chat resource ownership', () => {
  beforeEach(() => seedResourceAdminState(state));

  it('parses chat and temp resource paths within the workspace', () => {
    expect(
      parseAiChatResourcePath(WS, `${WS}/chats/ai/resources/${OWN_CHAT}/a.jpg`)
    ).toEqual({ kind: 'chat', chatId: OWN_CHAT });
    expect(
      parseAiChatResourcePath(WS, `${WS}/chats/ai/resources/temp/actor/a.jpg`)
    ).toEqual({ kind: 'temp', userId: 'actor' });
    expect(
      parseAiChatResourcePath(WS, `${WS}/chats/ai/resources/${OWN_CHAT}`)
    ).toBeNull();
    expect(
      parseAiChatResourcePath(WS, `${WS}/chats/ai/resources/not-a-chat/a.jpg`)
    ).toBeNull();
    expect(parseAiChatResourcePath(WS, `${WS}/mira/images/a.png`)).toBeNull();
  });

  it('allows deletes only in a chat the actor created', async () => {
    const access = (chatId: string) =>
      resolveAiChatResourceAccess(admin(), chatId, 'actor');
    await expect(access(OWN_CHAT)).resolves.toBe('allowed');
    for (const chatId of [OTHER_CHAT, OWN_THREAD, OTHER_THREAD, UNKNOWN_ID]) {
      await expect(access(chatId)).resolves.toBe('forbidden');
    }
  });

  it('uploads into an owned chat folder and sends every other id to temp', async () => {
    const folder = (chatId: string) =>
      resolveAiChatUploadFolder(admin(), chatId, 'actor');
    await expect(folder(OWN_CHAT)).resolves.toBe('chat');
    await expect(folder(OTHER_CHAT)).resolves.toBe('forbidden');
    // Mind threads own no chat-resource folder under storage RLS.
    await expect(folder(OWN_THREAD)).resolves.toBe('temp');
    await expect(folder(OTHER_THREAD)).resolves.toBe('temp');
    await expect(folder(UNKNOWN_ID)).resolves.toBe('temp');
    await expect(folder('not-a-uuid')).resolves.toBe('forbidden');
  });

  it('fails closed when the ownership lookup errors', async () => {
    state.lookupError = { message: 'boom' };
    await expect(
      resolveAiChatResourceAccess(admin(), OWN_CHAT, 'actor')
    ).resolves.toBe('lookup_failed');
    await expect(
      resolveAiChatUploadFolder(admin(), OWN_CHAT, 'actor')
    ).resolves.toBe('lookup_failed');
  });
});
