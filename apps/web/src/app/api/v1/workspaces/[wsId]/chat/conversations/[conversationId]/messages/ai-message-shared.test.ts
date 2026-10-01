import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  permissions: vi.fn(),
  finance: vi.fn(),
  chatRpc: vi.fn(),
  download: vi.fn(),
  resolveProvider: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.permissions(...args),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.membership(...args),
  normalizeWorkspaceId: async (wsId: string) =>
    wsId === 'personal' ? 'workspace-1' : wsId,
}));
vi.mock('@tuturuuu/finance-core/storage-access', () => ({
  canAccessFinanceTransactionStoragePath: (...args: unknown[]) =>
    mocks.finance(...args),
  getFinanceTransactionIdFromStoragePath: (path: string) =>
    path.startsWith('finance/transactions/') ? path.split('/')[2] : null,
}));
vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: unknown[]) => mocks.chatRpc(...args),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageFolderByPath: vi.fn(),
  downloadWorkspaceStorageObjectForProvider: (...args: unknown[]) =>
    mocks.download(...args),
  resolveWorkspaceStorageProvider: (...args: unknown[]) =>
    mocks.resolveProvider(...args),
  uploadWorkspaceStorageFileDirect: (...args: unknown[]) =>
    mocks.upload(...args),
}));

import {
  consumeAiResponseTextDeltas,
  copyAiChatAttachmentInputsToResources,
  copyChatAttachmentsToAiResources,
  copyRecentChatAttachmentsToAiResources,
} from './ai-message-shared';

const auth = { user: { id: 'actor-a' }, supabase: {} } as never;

describe('AI chat attachment resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.finance.mockResolvedValue(false);
    mocks.membership.mockResolvedValue({ ok: true });
    mocks.resolveProvider.mockResolvedValue({ provider: 'supabase' });
    mocks.download.mockResolvedValue({
      buffer: new Uint8Array([1]),
      contentType: 'text/plain',
    });
    mocks.upload.mockResolvedValue(undefined);
  });

  it('rejects a foreign workspace before any privileged storage operation', async () => {
    mocks.permissions.mockResolvedValue(null);
    await expect(
      copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [
          {
            filename: 'foreign.txt',
            path: 'uploads/foreign.txt',
            storageWsId: 'workspace-2',
          },
        ],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.resolveProvider).not.toHaveBeenCalled();
  });
  it.each(['workspace-1', 'workspace-2', 'personal'])(
    'copies an authorized source in %s using the normalized key',
    async (storageWsId) => {
      await copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [
          { filename: 'notes.txt', path: '/uploads\\notes.txt/', storageWsId },
        ],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      });
      expect(mocks.permissions).toHaveBeenCalledWith({
        user: { id: 'actor-a' },
        wsId: storageWsId === 'personal' ? 'workspace-1' : storageWsId,
      });
      expect(mocks.download).toHaveBeenCalledWith(
        storageWsId === 'personal' ? 'workspace-1' : storageWsId,
        'supabase',
        'uploads/notes.txt'
      );
    }
  );
  it.each([
    'uploads/../foreign.txt',
    'task-images/%2e%2e/foreign.txt',
    'uploads/%252e%252e/file',
    'uploads/%25252e%25252e/file',
    'uploads/%255cother/file',
    'uploads/%2fother/file',
  ])('rejects unsafe source representation %s', async (path) => {
    await expect(
      copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [{ filename: 'notes.txt', path }],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare');
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('rejects task media and finance objects without their domain read permission', async () => {
    mocks.permissions.mockResolvedValue({
      withoutPermission: (permission: string) =>
        permission === 'manage_drive_tasks_directory' ||
        permission === 'view_drive',
    });
    for (const path of [
      'task-images/photo.png',
      'finance/transactions/txn/receipt.pdf',
    ]) {
      await expect(
        copyAiChatAttachmentInputsToResources({
          auth,
          attachments: [{ filename: 'file.txt', path }],
          chatId: 'chat-1',
          wsId: 'workspace-1',
        })
      ).rejects.toThrow('Failed to prepare');
    }
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('authorizes an unpersisted native upload against its prepared conversation location', async () => {
    mocks.chatRpc.mockResolvedValue({
      storageWsId: 'workspace-1',
      pathPrefix: 'chats/conversation-a',
    });
    await copyAiChatAttachmentInputsToResources({
      auth,
      attachments: [
        { filename: 'photo.png', path: 'chats/conversation-a/photo.png' },
      ],
      chatId: 'chat-1',
      wsId: 'workspace-1',
    });
    expect(mocks.chatRpc).toHaveBeenCalledWith(
      'chat_prepare_attachment',
      expect.objectContaining({
        p_actor_user_id: 'actor-a',
        p_ws_id: 'workspace-1',
        p_conversation_id: 'conversation-a',
      })
    );
    mocks.download.mockClear();
    mocks.chatRpc.mockResolvedValue({
      storageWsId: 'workspace-2',
      pathPrefix: 'chats/conversation-a',
    });
    await expect(
      copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [
          { filename: 'photo.png', path: 'chats/conversation-a/photo.png' },
        ],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare');
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('requires source membership and actor ownership for legacy AI resources', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: 'source-chat' }, error: null }),
    };
    const resourceAuth = {
      user: { id: 'actor-a' },
      supabase: { from: vi.fn(() => query) },
    } as never;
    const input = {
      auth: resourceAuth,
      attachments: [
        {
          filename: 'notes.txt',
          path: 'chats/ai/resources/source-chat/notes.txt',
          storageWsId: 'workspace-2',
        },
      ],
      chatId: 'chat-1',
      wsId: 'workspace-1',
    };
    await copyAiChatAttachmentInputsToResources(input);
    expect(query.eq).toHaveBeenCalledWith('creator_id', 'actor-a');
    mocks.download.mockClear();
    mocks.membership.mockResolvedValue({ ok: false });
    await expect(copyAiChatAttachmentInputsToResources(input)).rejects.toThrow(
      'Failed to prepare'
    );
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.membership.mockResolvedValue({ ok: true });
    query.maybeSingle.mockResolvedValue({ data: null as never, error: null });
    await expect(copyAiChatAttachmentInputsToResources(input)).rejects.toThrow(
      'Failed to prepare'
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('rejects reserved deployment objects before storage even with Drive permission', async () => {
    await expect(
      copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [
          {
            filename: 'private.zip',
            path: '.tuturuuu/mobile-deployment-vault/version/private.zip',
            storageWsId: '00000000-0000-0000-0000-000000000000',
          },
        ],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare');
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('preserves ordinary filenames containing spaces, Unicode and percent signs', async () => {
    await copyAiChatAttachmentInputsToResources({
      auth,
      attachments: [
        { filename: 'notes.txt', path: 'uploads/100% hoàn tất.txt' },
      ],
      chatId: 'chat-1',
      wsId: 'workspace-1',
    });
    expect(mocks.download).toHaveBeenCalledWith(
      'workspace-1',
      'supabase',
      'uploads/100%25%20ho%C3%A0n%20t%E1%BA%A5t.txt'
    );
  });
  it('preserves finance source reads authorized through view_drive', async () => {
    mocks.finance.mockResolvedValue(false);
    await copyAiChatAttachmentInputsToResources({
      auth,
      attachments: [
        {
          filename: 'receipt.pdf',
          path: 'finance/transactions/txn/receipt.pdf',
          storageWsId: 'workspace-2',
        },
      ],
      chatId: 'chat-1',
      wsId: 'workspace-1',
    });
    expect(mocks.download).toHaveBeenCalledWith(
      'workspace-2',
      'supabase',
      'finance/transactions/txn/receipt.pdf'
    );
  });
  it('allows finance-only source reads without drive access', async () => {
    const permissions = { withoutPermission: () => true };
    mocks.permissions.mockResolvedValue(permissions);
    mocks.finance.mockResolvedValue(true);
    await copyAiChatAttachmentInputsToResources({
      auth,
      attachments: [
        {
          filename: 'receipt.pdf',
          path: 'finance/transactions/txn/receipt.pdf',
          storageWsId: 'workspace-2',
        },
      ],
      chatId: 'chat-1',
      wsId: 'workspace-1',
    });
    expect(mocks.finance).toHaveBeenCalledWith({
      access: 'read',
      normalizedWsId: 'workspace-2',
      path: 'finance/transactions/txn/receipt.pdf',
      permissions,
      supabase: {},
      userId: 'actor-a',
    });
    expect(mocks.download).toHaveBeenCalledWith(
      'workspace-2',
      'supabase',
      'finance/transactions/txn/receipt.pdf'
    );
  });
  it('keeps cross-workspace history when the actor-specific attachment RPC authorizes it', async () => {
    mocks.permissions.mockResolvedValue(null);
    const attachment = {
      id: 'attachment-a',
      conversationId: 'conversation-a',
      storageWsId: 'workspace-2',
      storagePath: 'chats/conversation-a/photo.png',
      filename: 'photo.png',
      sizeBytes: 10,
    };
    mocks.chatRpc.mockResolvedValue(attachment);
    const userMessage = {
      id: 'message-a',
      kind: 'user',
      attachments: [attachment],
    } as never;
    await copyChatAttachmentsToAiResources({
      auth,
      resourceChatId: 'shadow',
      targetWsId: 'workspace-1',
      userMessage,
    });
    await copyRecentChatAttachmentsToAiResources({
      auth,
      resourceChatId: 'shadow',
      targetWsId: 'workspace-1',
      previousMessages: [userMessage],
    });
    expect(mocks.chatRpc).toHaveBeenCalledWith('chat_get_attachment', {
      p_actor_user_id: 'actor-a',
      p_attachment_id: 'attachment-a',
      p_conversation_id: 'conversation-a',
      p_ws_id: 'workspace-1',
    });
    expect(mocks.download).toHaveBeenCalledTimes(2);
    mocks.download.mockClear();
    mocks.chatRpc.mockRejectedValue(new Error('access revoked'));
    await expect(
      copyChatAttachmentsToAiResources({
        auth,
        resourceChatId: 'shadow',
        targetWsId: 'workspace-1',
        userMessage,
      })
    ).rejects.toThrow('Failed to prepare');
    await copyRecentChatAttachmentsToAiResources({
      auth,
      resourceChatId: 'shadow',
      targetWsId: 'workspace-1',
      previousMessages: [userMessage],
    });
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('rejects an attachment identity whose authoritative storage key differs', async () => {
    mocks.chatRpc.mockResolvedValue({
      storageWsId: 'workspace-2',
      storagePath: 'chats/conversation-a/other.png',
    });
    const userMessage = {
      attachments: [
        {
          id: 'a',
          conversationId: 'conversation-a',
          storageWsId: 'workspace-2',
          storagePath: 'chats/conversation-a/photo.png',
          filename: 'photo.png',
        },
      ],
    } as never;
    await expect(
      copyChatAttachmentsToAiResources({
        auth,
        resourceChatId: 'shadow',
        targetWsId: 'workspace-1',
        userMessage,
      })
    ).rejects.toThrow('Failed to prepare');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('uses idempotent keys when retries mirror the same attachment', async () => {
    const input = {
      auth,
      attachments: [{ filename: 'notes.txt', path: 'uploads/notes.txt' }],
      chatId: 'chat-1',
      wsId: 'workspace-1',
    };

    await copyAiChatAttachmentInputsToResources(input);
    await copyAiChatAttachmentInputsToResources(input);

    const firstPath = mocks.upload.mock.calls[0]?.[1];
    const secondPath = mocks.upload.mock.calls[1]?.[1];
    expect(firstPath).toBe(secondPath);
    expect(firstPath).toMatch(
      /^chats\/ai\/resources\/chat-1\/.+-0-notes\.txt$/u
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      'workspace-1',
      expect.any(String),
      expect.any(Uint8Array),
      expect.objectContaining({ upsert: true })
    );
  });

  it('fails the request when an attachment cannot be mirrored', async () => {
    mocks.download.mockRejectedValue(new Error('storage unavailable'));

    await expect(
      copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [{ filename: 'notes.txt', path: 'uploads/notes.txt' }],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare a Chat attachment');
  });

  it('rejects attachment batches above the AI context byte budget', async () => {
    await expect(
      copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [
          {
            filename: 'large.bin',
            path: 'uploads/large.bin',
            sizeBytes: 100 * 1024 * 1024 + 1,
          },
        ],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('AI context size limit');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects when downloaded bytes exceed the AI context byte budget', async () => {
    mocks.download.mockResolvedValue({
      buffer: { byteLength: 100 * 1024 * 1024 + 1 },
      contentType: 'application/octet-stream',
    });

    await expect(
      copyAiChatAttachmentInputsToResources({
        auth,
        attachments: [{ filename: 'large.bin', path: 'uploads/large.bin' }],
        chatId: 'chat-1',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('Failed to prepare a Chat attachment');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('AI response SSE parsing', () => {
  it('parses CRLF-delimited events', async () => {
    const response = new Response(
      'data: {"type":"text-delta","delta":"hello"}\r\n\r\n' +
        'data: {"type":"text-delta","delta":" world"}\r\n\r\n'
    );

    await expect(consumeAiResponseTextDeltas(response)).resolves.toBe(
      'hello world'
    );
  });
});
