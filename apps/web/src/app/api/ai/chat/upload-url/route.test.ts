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
} from '../_lib/resource-admin.test-fixture';

const mocks = vi.hoisted(() => ({
  admin: null as unknown as ReturnType<typeof createResourceAdmin>,
  state: {} as ResourceAdminState,
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
  createAdminClient: async () => mocks.admin.client,
  createDynamicAdminClient: async () => mocks.admin.client,
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/ai/chat/upload-url', {
    body: JSON.stringify({ wsId: 'ws-1', ...body }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

async function uploadPath(chatId: string) {
  const response = await POST(
    request({ chatId, filename: 'photo.jpg' }) as never
  );
  expect(response.status).toBe(200);
  return (await response.json()).path as string;
}

describe('AI chat upload URL route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedResourceAdminState(mocks.state);
    mocks.admin = createResourceAdmin(mocks.state);
    mocks.verifyMembership.mockResolvedValue({ ok: true });
  });

  it("refuses another member's chat in the same workspace with 403", async () => {
    const response = await POST(
      request({ chatId: OTHER_CHAT, filename: 'photo.jpg' }) as never
    );

    expect(response.status).toBe(403);
    expect(mocks.admin.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("issues a never-overwriting URL inside the actor's own chat folder", async () => {
    expect(await uploadPath(OWN_CHAT)).toMatch(
      new RegExp(`^ws-1/chats/ai/resources/${OWN_CHAT}/\\d+_photo\\.jpg$`)
    );
    expect(mocks.admin.bucket.createSignedUploadUrl).toHaveBeenCalledWith(
      expect.any(String),
      { upsert: false }
    );
  });

  // Storage RLS (20261026170000) grants chat folders to the ai_chats creator
  // only, so Mind threads and not-yet-created chats upload to temp.
  it.each([
    ["the actor's own Mind thread", OWN_THREAD],
    ["another member's Mind thread", OTHER_THREAD],
    ['a not-yet-created chat', UNKNOWN_ID],
  ])("sends uploads for %s to the actor's temp folder", async (_, id) => {
    expect(await uploadPath(id)).toMatch(
      /^ws-1\/chats\/ai\/resources\/temp\/actor\/\d+_photo\.jpg$/
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
    expect(mocks.admin.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses non-members before checking chats', async () => {
    mocks.verifyMembership.mockResolvedValue({ ok: false });
    const response = await POST(
      request({ chatId: OWN_CHAT, filename: 'photo.jpg' }) as never
    );
    expect(response.status).toBe(403);
    expect(mocks.admin.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
