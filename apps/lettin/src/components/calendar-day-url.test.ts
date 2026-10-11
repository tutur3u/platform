import { getPortlessInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { afterEach, expect, it, vi } from 'vitest';
import { calendarDayUrl } from './calendar-day-url';

const wsId = '00000000-0000-4000-8000-000000000001';
afterEach(() => vi.unstubAllEnvs());
it.each(['en', 'vi'])(
  'uses the canonical Calendar workspace and a date-only query in %s',
  (locale) => {
    vi.stubEnv('NODE_ENV', 'production');
    const url = new URL(calendarDayUrl(wsId, locale, '2028-02-29')!);
    expect(url.origin).toBe('https://calendar.tuturuuu.com');
    expect(url.pathname).toBe(`/${locale}/${wsId}`);
    expect([...url.searchParams]).toEqual([['date', '2028-02-29']]);
    expect(url.hash).toBe('');
  }
);
it('uses the registered Portless Calendar origin during development', () => {
  vi.stubEnv('NODE_ENV', 'development');
  expect(new URL(calendarDayUrl('personal', 'en', '2026-10-10')!).origin).toBe(
    new URL(getPortlessInternalAppUrl('calendar')!).origin
  );
});
it.each([
  '',
  '2026-02-29',
  '2026-02-30',
  '2026-13-01',
  '2026-01-00',
  '2026-10-10T00:00:00Z',
  '2026-1-1',
  'https://external.test',
])(
  'rejects invalid calendar day %s instead of normalizing or transferring it',
  (day) => {
    expect(calendarDayUrl(wsId, 'en', day)).toBeNull();
  }
);
it.each(['../../other', 'https://external.test', '', 'workspace?secret=1'])(
  'rejects invalid workspace %s',
  (workspace) => {
    expect(calendarDayUrl(workspace, 'en', '2026-10-10')).toBeNull();
  }
);
it.each(['fr', '../en', 'en?next=secret'])(
  'rejects unsupported or injected locale %s',
  (locale) => {
    expect(calendarDayUrl(wsId, locale, '2026-10-10')).toBeNull();
  }
);
