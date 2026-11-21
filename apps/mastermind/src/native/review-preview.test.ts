import { expect, test, vi } from 'vitest';
import type { Owner } from './auth';
import { fetchReviewPreview } from './review-preview';

const owner: Owner = {
  id: 'owner',
  email: 'o@example.invalid',
  token: 'session-token',
  expiresAt: Date.now() + 60_000,
  mfa: true,
};
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
]);
const ASSET_ID = 'a'.repeat(64);
const mockup = 'https://claude.ai/artifact/abc';

test('reads an uploaded preview with the owner bearer and returns a data URL', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(PNG));
  const url = await fetchReviewPreview(
    owner,
    {
      mockupUrl: mockup,
      preview: { source: 'asset', assetId: ASSET_ID, contentType: 'image/png' },
    },
    fetcher
  );
  expect(url).toBe(
    `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
  );
  const request = fetcher.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    `https://tuturuuu.com/api/v1/mastermind/fleet/review-assets/${ASSET_ID}`
  );
  expect(request.headers.get('Authorization')).toBe('Bearer session-token');
  expect(request.redirect).toBe('manual');
});

test('reads a hosted preview without credentials and refuses other hosts', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(PNG));
  await fetchReviewPreview(
    owner,
    {
      mockupUrl: mockup,
      preview: { source: 'hosted', url: 'https://cdn.tuturuuu.com/m/a.png' },
    },
    fetcher
  );
  const request = fetcher.mock.calls[0]?.[0] as Request;
  expect(request.headers.get('Authorization')).toBeNull();
  expect(
    await fetchReviewPreview(
      owner,
      {
        mockupUrl: mockup,
        preview: { source: 'hosted', url: 'https://evil.example/a.png' },
      },
      fetcher
    )
  ).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('drops redirects, non-images, type mismatches and oversized bodies', async () => {
  const asset = {
    mockupUrl: mockup,
    preview: {
      source: 'asset' as const,
      assetId: ASSET_ID,
      contentType: 'image/jpeg' as const,
    },
  };
  for (const response of [
    new Response(null, { status: 302, headers: { location: 'https://x' } }),
    new Response('<svg onload="x"/>'),
    new Response(PNG),
    new Response(new Uint8Array(300 * 1024)),
  ])
    expect(
      await fetchReviewPreview(owner, asset, async () => response)
    ).toBeNull();
});
