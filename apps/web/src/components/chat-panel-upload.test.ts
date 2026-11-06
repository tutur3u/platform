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
vi.mock('./chat-model-selector', () => ({}));
vi.mock('./prompt-form', () => ({}));
vi.mock('./scroll-to-bottom-button', () => ({}));
vi.mock('./scroll-to-top-button', () => ({}));
vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://synthetic.invalid',
}));

import { uploadFile } from './chat-panel';

beforeEach(() => {
  vi.clearAllMocks();
});

it('uploads chat attachments through the signed upload API', async () => {
  const path = 'workspace/chats/ai/resources/chat/1_Bao_cao.txt';
  mocks.uploadAiChatFile.mockResolvedValue({ path });
  const file = new File(['synthetic'], 'Báo cáo.txt', { type: 'text/plain' });

  const result = await uploadFile(
    'workspace',
    { rawFile: file, url: '', status: 'pending' },
    'chat'
  );

  expect(result).toEqual({ data: { path }, error: null });
  expect(mocks.uploadAiChatFile).toHaveBeenCalledWith({
    chatId: 'chat',
    file,
    workspaceId: 'workspace',
  });
  expect(mocks.createDynamicClient).not.toHaveBeenCalled();
});

it('requires a chat id before uploading', async () => {
  const file = new File(['synthetic'], 'a.txt', { type: 'text/plain' });
  const result = await uploadFile('workspace', {
    rawFile: file,
    url: '',
    status: 'pending',
  });

  expect(result).toEqual({ data: null, error: 'No chat id provided' });
  expect(mocks.uploadAiChatFile).not.toHaveBeenCalled();
});

it('reports upload API failures', async () => {
  const failure = new Error("You don't have access to this chat");
  mocks.uploadAiChatFile.mockRejectedValue(failure);
  const file = new File(['synthetic'], 'a.txt', { type: 'text/plain' });

  const result = await uploadFile(
    'workspace',
    { rawFile: file, url: '', status: 'pending' },
    'chat'
  );

  expect(result).toEqual({ data: null, error: failure });
});
