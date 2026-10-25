import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWN_CHAT = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAT = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  chats: [] as { id: string; creator_id: string }[],
  createSignedUploadUrl: vi.fn(),
  verifyMembership: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown) => Response) =>
    (request: Request) =>
      handler(request, { supabase: {}, user: { id: 'actor' } }),
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async (wsId: string) => wsId,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyMembership(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => {
      let id: unknown;
      const query = {
        select: () => query,
        eq: (_key: string, value: unknown) => {
          id = value;
          return query;
        },
        maybeSingle: async () => ({
          data: mocks.chats.find((chat) => chat.id === id) ?? null,
          error: null,
        }),
      };
      return query;
    },
  }),
  createDynamicAdminClient: async () => ({
    storage: {
      from: () => ({ createSignedUploadUrl: mocks.createSignedUploadUrl }),
    },
  }),
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/ai/chat/upload-url', {
    body: JSON.stringify({ wsId: 'ws-1', ...body }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

describe('AI chat upload URL route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chats = [
      { id: OWN_CHAT, creator_id: 'actor' },
      { id: OTHER_CHAT, creator_id: 'other-member' },
    ];
    mocks.verifyMembership.mockResolvedValue({ ok: true });
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.test/upload', token: 'token' },
      error: null,
    });
  });

  it("refuses another member's chat in the same workspace", async () => {
    const response = await POST(
      request({ chatId: OTHER_CHAT, filename: 'photo.jpg' }) as never
    );

    expect(response.status).toBe(404);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("issues a URL inside the actor's own chat folder", async () => {
    const response = await POST(
      request({ chatId: OWN_CHAT, filename: 'photo.jpg' }) as never
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.path).toMatch(
      new RegExp(`^ws-1/chats/ai/resources/${OWN_CHAT}/\\d+_photo\\.jpg$`)
    );
  });

  it.each(['voice.m4a', 'voice.mp3', 'voice.wav', 'voice.aac', 'photo.heic'])(
    'accepts %s, which the model path supports',
    async (filename) => {
      const response = await POST(
        request({ chatId: OWN_CHAT, filename }) as never
      );
      expect(response.status).toBe(200);
    }
  );

  it('rejects unsupported types and oversized declared files', async () => {
    const unsupported = await POST(request({ filename: 'tool.exe' }) as never);
    expect(unsupported.status).toBe(400);

    const oversized = await POST(
      request({ filename: 'clip.m4a', sizeBytes: 33 * 1024 * 1024 }) as never
    );
    expect(oversized.status).toBe(413);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses non-members before checking chats', async () => {
    mocks.verifyMembership.mockResolvedValue({ ok: false });
    const response = await POST(
      request({ chatId: OWN_CHAT, filename: 'photo.jpg' }) as never
    );
    expect(response.status).toBe(403);
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
