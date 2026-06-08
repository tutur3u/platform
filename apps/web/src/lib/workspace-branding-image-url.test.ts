import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TUTURUUU_REMOTE_LOGO_URL,
} from '@tuturuuu/ui/custom/tuturuuu-logo-urls';
import { describe, expect, it, vi } from 'vitest';
import { resolveWorkspaceImageSrcForNext } from './workspace-branding-image-url';

function createSupabaseStorageMock() {
  const createSignedUrl = vi.fn();
  const from = vi.fn(() => ({ createSignedUrl }));

  return {
    client: {
      storage: { from },
    } as unknown as TypedSupabaseClient,
    createSignedUrl,
    from,
  };
}

describe('resolveWorkspaceImageSrcForNext', () => {
  it('maps the canonical hosted Tuturuuu logo to the apps/web local asset', async () => {
    const storage = createSupabaseStorageMock();

    await expect(
      resolveWorkspaceImageSrcForNext(
        storage.client,
        ` ${TUTURUUU_REMOTE_LOGO_URL} `
      )
    ).resolves.toBe(TUTURUUU_LOCAL_LOGO_URL);

    expect(storage.from).not.toHaveBeenCalled();
  });

  it('keeps other absolute image URLs usable by next/image unchanged', async () => {
    const storage = createSupabaseStorageMock();
    const imageUrl = 'https://assets.example.com/workspace/logo.png';

    await expect(
      resolveWorkspaceImageSrcForNext(storage.client, imageUrl)
    ).resolves.toBe(imageUrl);

    expect(storage.from).not.toHaveBeenCalled();
  });

  it('signs workspace storage object paths', async () => {
    const storage = createSupabaseStorageMock();
    storage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.com/signed-logo.png' },
      error: null,
    });

    await expect(
      resolveWorkspaceImageSrcForNext(storage.client, 'ws-id/logo.png')
    ).resolves.toBe('https://storage.example.com/signed-logo.png');

    expect(storage.from).toHaveBeenCalledWith('workspaces');
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      'ws-id/logo.png',
      60 * 15
    );
  });
});
