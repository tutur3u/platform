import { STORES } from '@tuturuuu/roadmap-core/components/ds/store-data.ts';
import { OverviewPanel } from '@tuturuuu/roadmap-core/components/ds/store-panels.tsx';
import { StoreReleaseList } from '@tuturuuu/roadmap-core/components/store-releases.tsx';
import en from '@tuturuuu/roadmap-core/messages/en.json';
import vi from '@tuturuuu/roadmap-core/messages/vi.json';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

const now = Date.parse('2026-11-20T08:00:00Z');

it('renders every store as one compact row with its steps and two thumbnails', () => {
  const html = renderToStaticMarkup(
    <StoreReleaseList lang="en" t={en.storeReleases} now={now} />
  );
  for (const store of [
    'iOS App Store',
    'Mac App Store',
    'Google Play',
    'Microsoft Store',
  ])
    expect(html).toContain(store);
  expect(html).toContain('Next release: iOS App Store, December 10, 2026');
  // Each row is one button that opens the store dialog.
  expect(html.match(/data-store-row="/g)).toHaveLength(4);
  expect(html).toContain('aria-haspopup="dialog"');
  // Each store keeps its anchor, so a link to #store-ios lands on its row.
  for (const id of ['ios', 'macos', 'android', 'windows'])
    expect(html).toContain(`id="store-${id}"`);
  // Submit, review and release, with the targets as plans. A date sits on
  // its own line and is never clipped on a narrow phone.
  expect(html).toContain('Submit');
  expect(html).toContain('Target 27 Nov');
  expect(html).not.toContain('truncate text-muted-foreground text-xs');
  // Two decorative thumbnails per row, lazy, sized and with a skeleton.
  expect(html.match(/<img /g)).toHaveLength(8);
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('alt=""');
  expect(html).toContain('data-slot="skeleton"');
  // A button holds phrasing content only: no div from a shared skeleton.
  for (const button of html.match(/<button[\s\S]*?<\/button>/g) ?? [])
    expect(button).not.toMatch(/<(div|p|ul|ol|li|h[1-6])[\s>]/);
  // The long listing text lives in the dialog, not the row.
  expect(html).not.toContain('PLAN YOUR WORK');
});

it('renders the Vietnamese strings', () => {
  const html = renderToStaticMarkup(
    <StoreReleaseList lang="vi" t={vi.storeReleases} now={now} />
  );
  expect(html).toContain('Phát hành trên cửa hàng');
  expect(html).toContain('Bản phát hành tiếp theo');
  expect(html).toContain('Gửi duyệt');
  expect(html).not.toContain('Target submission');
});

it("shows a store's category in the page's language", () => {
  const [store] = STORES;
  if (!store) throw new Error('no stores');
  const html = renderToStaticMarkup(
    <OverviewPanel store={store} lang="vi" t={vi.storeReleases} />
  );
  expect(html).toContain('Năng suất');
  expect(html).not.toContain('Productivity');
});
