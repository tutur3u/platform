import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('next/server', () => ({ connection: async () => {} }));
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

const request = (query = '') =>
  new Request(`https://tuturuuu.com/meet/r/code/preview${query}`);
const params = (locale = 'en') =>
  ({ params: Promise.resolve({ locale, code: 'code' }) }) as const;

beforeEach(() => mocks.info.mockReset());
it('renders the generic card for a private room and never leaks details', async () => {
  mocks.info.mockResolvedValue(null);
  const rendered = JSON.stringify(await GET(request(), params('vi')));
  expect(rendered).toContain('Tham gia cuộc họp');
  expect(rendered).toContain('tuturuuu.com/meet');
  expect(rendered).not.toContain('Secret meeting');
  expect(rendered).not.toContain('meet.tuturuuu.com');
  expect(mocks.info).toHaveBeenCalledWith('code');
});
it('renders the approved title and a UTC schedule for a public room', async () => {
  mocks.info.mockResolvedValue({
    title: 'Public meeting',
    ended: false,
    scheduledAt: '2026-09-20T13:21:00Z',
  });
  const rendered = JSON.stringify(await GET(request('?lang=en'), params()));
  expect(rendered).toContain('Public meeting');
  expect(rendered).toContain('20 Sep 2026 · 13:21 UTC');
  expect(rendered).toContain('public, max-age=300');
  expect(rendered).not.toContain('meet.tuturuuu.com');
});
it('honours the lang query over the route locale', async () => {
  mocks.info.mockResolvedValue(null);
  const rendered = JSON.stringify(await GET(request('?lang=vi'), params('en')));
  expect(rendered).toContain('Tham gia cuộc họp');
});
