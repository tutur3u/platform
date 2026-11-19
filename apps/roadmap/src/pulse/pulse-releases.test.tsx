import { StoreReleases } from '@tuturuuu/roadmap-core/components/store-releases.tsx';
import en from '@tuturuuu/roadmap-core/messages/en.json';
import vi from '@tuturuuu/roadmap-core/messages/vi.json';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

const now = Date.parse('2026-11-20T08:00:00Z');

it('renders every store with its release dates and screenshot thumbnails', () => {
  const html = renderToStaticMarkup(
    <StoreReleases lang="en" t={en.storeReleases} now={now} />
  );
  for (const store of [
    'iOS App Store',
    'Mac App Store',
    'Google Play',
    'Microsoft Store',
  ])
    expect(html).toContain(store);
  expect(html).toContain('Next release: iOS App Store, December 10, 2026');
  expect(html).toContain('Target submission');
  // Thumbnails are buttons that open the preview, lazy images with their
  // intrinsic size so the strip never shifts.
  expect(html).toMatch(/<button[^>]*aria-label="Preview Your day at a glance"/);
  expect(html).toContain('loading="lazy"');
  expect(html).toMatch(/aspect-ratio:\s*0\.46/);
  // Before the image has loaded a skeleton holds its place.
  expect(html).toContain('data-slot="skeleton"');
});

it('renders the Vietnamese strings and captions', () => {
  const html = renderToStaticMarkup(
    <StoreReleases lang="vi" t={vi.storeReleases} now={now} />
  );
  expect(html).toContain('Phát hành trên cửa hàng');
  expect(html).toContain('Bản phát hành tiếp theo');
  expect(html).toContain('Xem trước Cả ngày của bạn trong một màn hình');
  expect(html).not.toContain('Target submission');
});
