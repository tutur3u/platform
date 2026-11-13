import { describe, expect, it } from 'vitest';
import {
  CALENDAR_MOUNT_BASE_PATH,
  CALENDAR_ROOT_ORIGIN,
  WEB_ORIGIN,
} from './calendar-origins';
import { manifestPathFor, resolveCalendarSiteUrls } from './site-urls';

const origins = { rootOrigin: CALENDAR_ROOT_ORIGIN, webOrigin: WEB_ORIGIN };

describe('Calendar site URLs', () => {
  it('keeps the host-root URLs on the Calendar origin', () => {
    expect(resolveCalendarSiteUrls({ ...origins, basePath: '' })).toEqual({
      origin: 'https://calendar.tuturuuu.com',
      basePath: '',
      url: 'https://calendar.tuturuuu.com',
      ogImage: 'https://calendar.tuturuuu.com/media/logos/og-image.png',
      manifest: 'https://calendar.tuturuuu.com/site.webmanifest',
      icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
    });
    expect(resolveCalendarSiteUrls(origins)).toEqual(
      resolveCalendarSiteUrls({ ...origins, basePath: '' })
    );
  });

  it('derives the mounted URLs from the web origin and the base path', () => {
    expect(
      resolveCalendarSiteUrls({
        ...origins,
        basePath: CALENDAR_MOUNT_BASE_PATH,
      })
    ).toEqual({
      origin: 'https://tuturuuu.com',
      basePath: '/calendar',
      url: 'https://tuturuuu.com/calendar',
      ogImage: 'https://tuturuuu.com/calendar/media/logos/og-image.png',
      manifest: 'https://tuturuuu.com/calendar/site.mount.webmanifest',
      icons: {
        icon: '/calendar/favicon.ico',
        apple: '/calendar/apple-touch-icon.png',
      },
    });
  });

  it('normalizes a trailing slash and rejects an invalid base', () => {
    expect(
      resolveCalendarSiteUrls({ ...origins, basePath: '/calendar/' }).url
    ).toBe('https://tuturuuu.com/calendar');
    expect(() =>
      resolveCalendarSiteUrls({ ...origins, basePath: 'calendar' })
    ).toThrow(/Invalid basePath/u);
  });

  it('selects the manifest by mount', () => {
    expect(manifestPathFor('')).toBe('/site.webmanifest');
    expect(manifestPathFor(undefined)).toBe('/site.webmanifest');
    expect(manifestPathFor('/calendar')).toBe('/site.mount.webmanifest');
  });
});
