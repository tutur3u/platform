import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createResourceAdmin,
  JPEG_BYTES,
  OTHER_CHAT,
  OTHER_THREAD,
  OWN_CHAT,
  OWN_THREAD,
  type ResourceAdminState,
  seedResourceAdminState,
  stubStorageFetch,
  UNKNOWN_ID,
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

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks.admin.client,
  createDynamicAdminClient: async () => mocks.admin.client,
}));

import { POST as deleteFile } from '../delete-file/route';
import { POST as fileUrls } from '../file-urls/route';
import { POST as signedReadUrl } from '../signed-read-url/route';

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

const resource = (owner: string, name = '1_photo.jpg') =>
  `ws-1/chats/ai/resources/${owner}/${name}`;

describe('legacy AI chat resource routes', () => {
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

  describe.each([
    ["another member's chat", OTHER_CHAT],
    ["another member's Mind thread", OTHER_THREAD],
    ['a folder with no owning record', UNKNOWN_ID],
    ["another member's temp folder", 'temp/other-member'],
  ])('denies %s', (_, owner) => {
    it('on file-urls', async () => {
      if (owner.startsWith('temp/')) return; // file-urls takes chat ids only
      const response = await post(fileUrls, { chatId: owner, wsId: 'ws-1' });
      expect(response.status).toBe(404);
      expect(mocks.admin.bucket.list).not.toHaveBeenCalled();
    });

    it('on signed-read-url', async () => {
      const response = await post(signedReadUrl, {
        paths: [resource(OWN_CHAT), resource(owner)],
      });
      expect(response.status).toBe(404);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
    });

    it('on delete-file', async () => {
      const response = await post(deleteFile, {
        path: resource(owner),
        wsId: 'ws-1',
      });
      expect(response.status).toBe(404);
      expect(mocks.state.objects.has(resource(owner))).toBe(true);
    });
  });

  it.each([OWN_CHAT, OWN_THREAD])(
    'lists and signs the actor’s own folder %s',
    async (owner) => {
      const listed = await post(fileUrls, { chatId: owner, wsId: 'ws-1' });
      expect(listed.status).toBe(200);
      expect((await listed.json()).files).toEqual([
        expect.objectContaining({ path: resource(owner) }),
      ]);

      const signed = await post(signedReadUrl, { paths: [resource(owner)] });
      expect(signed.status).toBe(200);

      const deleted = await post(deleteFile, {
        path: resource(owner),
        wsId: 'ws-1',
      });
      expect(deleted.status).toBe(200);
      expect(mocks.state.objects.has(resource(owner))).toBe(false);
    }
  );

  it("signs the actor's own temp upload", async () => {
    const response = await post(signedReadUrl, {
      paths: [resource('temp/actor')],
    });
    expect(response.status).toBe(200);
  });

  describe('stored object verification', () => {
    it('rejects and deletes a renamed non-image .jpg before signing it', async () => {
      const path = resource(OWN_CHAT, '2_fake.jpg');
      mocks.state.objects.set(path, new TextEncoder().encode('<html>'));

      const response = await post(signedReadUrl, { paths: [path] });

      expect(response.status).toBe(422);
      expect(mocks.admin.bucket.createSignedUrls).not.toHaveBeenCalled();
      expect(mocks.state.objects.has(path)).toBe(false);
    });

    it('rejects an over-limit object whatever size was declared', async () => {
      const path = resource('temp/actor', '2_big.jpg');
      const bytes = new Uint8Array(32 * 1024 * 1024 + 1);
      bytes.set(JPEG_BYTES);
      mocks.state.objects.set(path, bytes);

      const response = await post(signedReadUrl, { paths: [path] });

      expect(response.status).toBe(422);
      expect(mocks.state.objects.has(path)).toBe(false);
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

    it('omits and deletes unverified objects from file-urls', async () => {
      const fake = resource(OWN_CHAT, '2_fake.png');
      mocks.state.objects.set(fake, JPEG_BYTES);

      const response = await post(fileUrls, {
        chatId: OWN_CHAT,
        wsId: 'ws-1',
      });

      expect(response.status).toBe(200);
      expect((await response.json()).files).toEqual([
        expect.objectContaining({ path: resource(OWN_CHAT) }),
      ]);
      expect(mocks.state.objects.has(fake)).toBe(false);
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
