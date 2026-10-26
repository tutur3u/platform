import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceAdmin,
  JPEG_BYTES,
  OTHER_CHAT,
  OTHER_THREAD,
  OTHER_WS,
  OWN_CHAT,
  OWN_THREAD,
  type ResourceAdminState,
  seedResourceAdminState,
  stubStorageFetch,
  UNKNOWN_ID,
  WS,
} from './resource-admin.test-fixture';

const mocks = vi.hoisted(() => ({
  admin: null as unknown as ReturnType<typeof createResourceAdmin>,
  state: {} as ResourceAdminState,
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

// The actor is a MEMBER of WS only.
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async ({ wsId }: { wsId: string }) =>
    wsId === '66666666-6666-4666-8666-666666666666'
      ? { membershipType: 'MEMBER', ok: true }
      : { error: 'membership_missing', ok: false },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks.admin.client,
  createDynamicAdminClient: async () => mocks.admin.client,
}));

import { POST as deleteFile } from '../delete-file/route';
import { POST as fileUrls } from '../file-urls/route';
import { POST as signedReadUrl } from '../signed-read-url/route';
import { POST as uploadUrl } from '../upload-url/route';

function post(
  handler: (request: never) => Promise<Response>,
  body: Record<string, unknown>
) {
  return handler(
    new Request('http://localhost/api/ai/chat', {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }) as never
  );
}

const resource = (owner: string, name = '1_photo.jpg', wsId = WS) =>
  `${wsId}/chats/ai/resources/${owner}/${name}`;

describe('AI chat resource routes', () => {
  beforeEach(() => {
    seedResourceAdminState(mocks.state);
    mocks.admin = createResourceAdmin(mocks.state);
    for (const owner of [
      OWN_CHAT,
      OTHER_CHAT,
      OWN_THREAD,
      OTHER_THREAD,
      UNKNOWN_ID,
      'temp/actor',
      'temp/other-member',
    ]) {
      mocks.state.objects.set(resource(owner), JPEG_BYTES);
    }
    vi.stubGlobal('fetch', stubStorageFetch(mocks.state));
  });

  afterEach(() => vi.unstubAllGlobals());

  // Storage RLS (20261026170000) grants chat folders to the ai_chats creator
  // only, so Mind-thread folders are denied like any other non-owned folder.
  describe.each([
    ["another member's chat", OTHER_CHAT],
    ["the actor's own Mind thread", OWN_THREAD],
    ["another member's Mind thread", OTHER_THREAD],
    ['a folder with no owning record', UNKNOWN_ID],
    ["another member's temp folder", 'temp/other-member'],
  ])('denies %s with 403', (_, owner) => {
    it('on file-urls', async () => {
      if (owner.startsWith('temp/')) return; // file-urls takes chat ids only
      const response = await post(fileUrls, { chatId: owner, wsId: WS });
      expect(response.status).toBe(403);
      expect(mocks.admin.bucket.list).not.toHaveBeenCalled();
    });

    it('on signed-read-url', async () => {
      const response = await post(signedReadUrl, {
        paths: [resource(OWN_CHAT), resource(owner)],
      });
      expect(response.status).toBe(403);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
    });

    it('on delete-file', async () => {
      const response = await post(deleteFile, {
        path: resource(owner),
        wsId: WS,
      });
      expect(response.status).toBe(403);
      expect(mocks.state.objects.has(resource(owner))).toBe(true);
    });
  });

  describe('cross-workspace access', () => {
    it('denies file-urls in a workspace the actor is not a member of', async () => {
      mocks.state.objects.set(resource(OWN_CHAT, '1_a.jpg', OTHER_WS), JPEG_BYTES);
      const response = await post(fileUrls, { chatId: OWN_CHAT, wsId: OTHER_WS });
      expect(response.status).toBe(403);
      expect(mocks.admin.bucket.list).not.toHaveBeenCalled();
    });

    it("denies signed-read-url for the actor's own chat id in another workspace", async () => {
      const path = resource(OWN_CHAT, '1_a.jpg', OTHER_WS);
      mocks.state.objects.set(path, JPEG_BYTES);
      const response = await post(signedReadUrl, { paths: [path] });
      expect(response.status).toBe(403);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
    });

    it('rejects delete-file for a path outside the requested workspace', async () => {
      const path = resource(OWN_CHAT, '1_a.jpg', OTHER_WS);
      mocks.state.objects.set(path, JPEG_BYTES);
      const response = await post(deleteFile, { path, wsId: WS });
      expect(response.status).toBe(400);
      expect(mocks.state.objects.has(path)).toBe(true);
    });

    it('denies delete-file in a workspace the actor is not a member of', async () => {
      const path = resource(OWN_CHAT, '1_a.jpg', OTHER_WS);
      mocks.state.objects.set(path, JPEG_BYTES);
      const response = await post(deleteFile, { path, wsId: OTHER_WS });
      expect(response.status).toBe(403);
      expect(mocks.state.objects.has(path)).toBe(true);
    });

    it('denies upload-url in a workspace the actor is not a member of', async () => {
      const response = await post(uploadUrl, {
        chatId: OWN_CHAT,
        filename: 'photo.jpg',
        wsId: OTHER_WS,
      });
      expect(response.status).toBe(403);
      expect(mocks.admin.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
    });

    it("denies upload-url into another member's chat", async () => {
      const response = await post(uploadUrl, {
        chatId: OTHER_CHAT,
        filename: 'photo.jpg',
        wsId: WS,
      });
      expect(response.status).toBe(403);
      expect(mocks.admin.bucket.createSignedUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('private roots', () => {
    it.each([
      ['native Chat', `${WS}/chats/conversations/x.png`],
      ['recordings', `${WS}/recordings/a.webm`],
      ['Drive', `${WS}/docs/report.pdf`],
    ])('rejects signed-read-url for %s paths', async (_, path) => {
      const response = await post(signedReadUrl, { paths: [path] });
      expect(response.status).toBe(400);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
    });

    it.each([
      ['native Chat', `${WS}/chats/conversations/x.png`],
      ['recordings', `${WS}/recordings/a.webm`],
    ])('rejects delete-file for %s paths', async (_, path) => {
      const response = await post(deleteFile, { path, wsId: WS });
      expect(response.status).toBe(400);
      expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
    });
  });

  it("lists, signs and deletes the actor's own chat folder", async () => {
    const listed = await post(fileUrls, { chatId: OWN_CHAT, wsId: WS });
    expect(listed.status).toBe(200);
    expect((await listed.json()).files).toEqual([
      expect.objectContaining({ path: resource(OWN_CHAT) }),
    ]);

    const signed = await post(signedReadUrl, { paths: [resource(OWN_CHAT)] });
    expect(signed.status).toBe(200);

    const deleted = await post(deleteFile, {
      path: resource(OWN_CHAT),
      wsId: WS,
    });
    expect(deleted.status).toBe(200);
    expect(mocks.state.objects.has(resource(OWN_CHAT))).toBe(false);
  });

  it("signs the actor's own temp upload", async () => {
    const response = await post(signedReadUrl, {
      paths: [resource('temp/actor')],
    });
    expect(response.status).toBe(200);
  });

  describe('stored object verification', () => {
    it('refuses to serve a bad new upload after issuing its upload URL', async () => {
      const prepared = await post(uploadUrl, {
        wsId: WS,
        filename: 'fake.jpg',
        sizeBytes: 6,
      });
      expect(prepared.status).toBe(200);
      const { path } = await prepared.json();
      mocks.state.objects.set(path, new TextEncoder().encode('<html>'));
      const response = await post(signedReadUrl, { paths: [path] });
      expect(response.status).toBe(422);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
      expect(mocks.state.objects.has(path)).toBe(true);
      expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
    });

    it.each([
      ['notes.txt', new Uint8Array([0xff, 0xfe, 0x41, 0, 0x42, 0])],
      ['table.csv', new Uint8Array([0xfe, 0xff, 0, 0x41, 0, 0x2c, 0, 0x42])],
    ])(
      'lists and reads historical UTF-16 %s without deleting it',
      async (name, bytes) => {
        const path = resource(OWN_CHAT, name);
        mocks.state.objects.set(path, bytes);
        const listed = await post(fileUrls, { chatId: OWN_CHAT, wsId: WS });
        expect(listed.status).toBe(200);
        expect((await listed.json()).files).toContainEqual(
          expect.objectContaining({ path })
        );
        const signed = await post(signedReadUrl, { paths: [path] });
        expect(signed.status).toBe(200);
        expect(mocks.state.objects.get(path)).toBe(bytes);
        expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
      }
    );

    it.each([33, 50])(
      'preserves a historical %i MiB attachment on list and read',
      async (size) => {
        const path = resource(OWN_CHAT, 'old.jpg');
        const bytes = new Uint8Array(size * 1024 * 1024);
        bytes.set(JPEG_BYTES);
        mocks.state.objects.set(path, bytes);
        const listed = await post(fileUrls, { chatId: OWN_CHAT, wsId: WS });
        expect(listed.status).toBe(200);
        expect((await listed.json()).files).not.toContainEqual(
          expect.objectContaining({ path })
        );
        mocks.admin.bucket.createSignedUrls.mockClear();
        const signed = await post(signedReadUrl, { paths: [path] });
        expect(signed.status).toBe(422);
        expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
        expect(mocks.state.objects.get(path)).toBe(bytes);
        expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
      }
    );

    it('rejects and preserves a renamed non-image .jpg before signing it', async () => {
      const path = resource(OWN_CHAT, '2_fake.jpg');
      mocks.state.objects.set(path, new TextEncoder().encode('<html>'));

      const response = await post(signedReadUrl, { paths: [path] });

      expect(response.status).toBe(422);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
      expect(mocks.state.objects.has(path)).toBe(true);
      expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
    });

    it('rejects an over-limit object whatever size was declared', async () => {
      const path = resource('temp/actor', '2_big.jpg');
      const bytes = new Uint8Array(32 * 1024 * 1024 + 1);
      bytes.set(JPEG_BYTES);
      mocks.state.objects.set(path, bytes);

      const response = await post(signedReadUrl, { paths: [path] });

      expect(response.status).toBe(422);
      expect(mocks.state.objects.has(path)).toBe(true);
      expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
      // Size alone fails it; the head is never fetched.
      expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps server-written objects with other extensions', async () => {
      const path = resource(OWN_CHAT, '2_render.avif');
      mocks.state.objects.set(path, new TextEncoder().encode('....ftypavif'));

      const response = await post(signedReadUrl, { paths: [path] });

      expect(response.status).toBe(200);
      expect(mocks.state.objects.has(path)).toBe(true);
      expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
    });

    it('reads only the signature bytes when Range is ignored', async () => {
      const path = resource(OWN_CHAT, '2_photo.jpg');
      const bytes = new Uint8Array(1024 * 1024);
      bytes.set(JPEG_BYTES);
      mocks.state.objects.set(path, bytes);
      let pulled = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              new ReadableStream({
                pull(controller) {
                  // 1 MiB in 16 KiB chunks; a full read pulls all 64.
                  pulled += 1;
                  controller.enqueue(bytes.slice(0, 16 * 1024));
                  if (pulled === 64) controller.close();
                },
              }),
              { status: 200 }
            )
        )
      );

      const response = await post(signedReadUrl, { paths: [path] });

      expect(response.status).toBe(200);
      expect(pulled).toBeLessThanOrEqual(2);
    });

    it('omits and preserves unverified objects from file-urls', async () => {
      const fake = resource(OWN_CHAT, '2_fake.png');
      mocks.state.objects.set(fake, JPEG_BYTES);

      const response = await post(fileUrls, {
        chatId: OWN_CHAT,
        wsId: WS,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).files).toEqual([
        expect.objectContaining({ path: resource(OWN_CHAT) }),
      ]);
      expect(mocks.state.objects.has(fake)).toBe(true);
      expect(mocks.admin.bucket.remove).not.toHaveBeenCalled();
    });

    it('keeps an object unreadable when it cannot be inspected', async () => {
      const response = await post(signedReadUrl, {
        paths: [resource(OWN_CHAT, '9_missing.jpg')],
      });
      expect(response.status).toBe(404);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
    });
  });
});
