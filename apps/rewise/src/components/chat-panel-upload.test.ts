// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDynamicClient: vi.fn(),
  uploadAiChatFile: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  uploadAiChatFile: mocks.uploadAiChatFile,
}));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createDynamicClient: mocks.createDynamicClient,
}));
vi.mock('@/components/chat-permissions', () => ({}));
vi.mock('./assistant-header', () => ({}));
vi.mock('./assistant-toolbar', () => ({}));
vi.mock('./prompt-form', () => ({}));

import { uploadFile } from './chat-panel';

beforeEach(() => {
  vi.clearAllMocks();
});

const rawFile = new File(['synthetic'], 'what?.txt', { type: 'text/plain' });

it('uploads into an existing chat through the signed upload API', async () => {
  const path = 'workspace/chats/ai/resources/chat/1_what_.txt';
  mocks.uploadAiChatFile.mockResolvedValue({ path });

  const result = await uploadFile(
    { rawFile, url: '', status: 'pending' },
    'chat',
    'workspace'
  );

  expect(mocks.uploadAiChatFile).toHaveBeenCalledWith({
    chatId: 'chat',
    file: rawFile,
    workspaceId: 'workspace',
  });
  expect(result).toEqual({
    data: { path },
    error: null,
    tempPath: undefined,
    finalPath: path,
  });
  expect(mocks.createDynamicClient).not.toHaveBeenCalled();
});

it('stores pre-chat uploads as temp paths', async () => {
  const path = 'workspace/chats/ai/resources/temp/user/1_what_.txt';
  mocks.uploadAiChatFile.mockResolvedValue({ path });

  const result = await uploadFile(
    { rawFile, url: '', status: 'pending' },
    undefined,
    'workspace'
  );

  expect(mocks.uploadAiChatFile).toHaveBeenCalledWith({
    chatId: undefined,
    file: rawFile,
    workspaceId: 'workspace',
  });
  expect(result.tempPath).toBe(path);
  expect(result.finalPath).toBeUndefined();
});

it('requires a workspace id', async () => {
  const result = await uploadFile({ rawFile, url: '', status: 'pending' });

  expect(result.error).toBe('No workspace id provided');
  expect(mocks.uploadAiChatFile).not.toHaveBeenCalled();
});
