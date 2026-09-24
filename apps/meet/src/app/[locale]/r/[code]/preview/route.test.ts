import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next-intl/server', () => ({
  getTranslations:
    async ({ locale }: { locale: string }) =>
    (key: string) =>
      `${locale}:${key}`,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/meeting-public-info', () => ({
  getMeetingPublicInfo: mocks.info,
}));
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(
      public element: unknown,
      public options: unknown
    ) {}
  },
}));

import { GET } from './route';

beforeEach(() => mocks.info.mockReset());
it('uses only the public policy result and never caches private meeting details', async () => {
  mocks.info.mockResolvedValue(null);
  const response = await GET(
    new Request('https://meet.tuturuuu.com/r/code/preview'),
    { params: Promise.resolve({ locale: 'vi', code: 'code' }) }
  );
  const rendered = JSON.stringify(response);
  expect(rendered).toContain('vi:meta_title');
  expect(rendered).toContain('private, no-store');
  expect(rendered).not.toContain('Secret meeting');
  expect(mocks.info).toHaveBeenCalledWith('code');
});
it('renders the approved meeting title and localized status without an assumed timezone', async () => {
  mocks.info.mockResolvedValue({
    title: 'Public meeting',
    ended: true,
    scheduledAt: '2026-09-20T13:21:00Z',
  });
  const response = await GET(
    new Request('https://meet.tuturuuu.com/r/code/preview?lang=vi'),
    { params: Promise.resolve({ locale: 'vi', code: 'code' }) }
  );
  const rendered = JSON.stringify(response);
  expect(rendered).toContain('Public meeting');
  expect(rendered).toContain('vi:ended');
  expect(rendered).not.toContain('13:21');
});
