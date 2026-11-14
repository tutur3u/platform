import type { AppMountConfig } from '@tuturuuu/start-bridge/mounts';
import { describe, expect, it } from 'vitest';
import { apexMountLocation } from './calendar-mount';

const production: AppMountConfig = {
  app: 'calendar',
  rootHosts: ['calendar.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/calendar',
};
const legacy = new URL('https://calendar.tuturuuu.com/verify-token?x=1');

describe('apexMountLocation', () => {
  it.each([
    '/calendar/verify-token?nextUrl=%2Fabc',
    '/calendar',
    '/calendar?view=week',
    '/calendar/vi/personal',
  ])('names the apex mount absolutely for %s', (location) => {
    expect(apexMountLocation(legacy, location, production)).toBe(
      `https://tuturuuu.com${location}`
    );
  });

  it.each([
    ['an app path outside the base', '/personal'],
    ['a sibling path sharing the prefix', '/calendars/x'],
    ['an absolute URL', 'https://tuturuuu.com/login'],
    ['a protocol-relative URL', '//evil.example/calendar'],
    ['no location', null],
  ])('leaves %s unchanged', (_label, location) => {
    expect(apexMountLocation(legacy, location, production)).toBeNull();
  });

  it('only rewrites redirects answered for a subdomain root host', () => {
    expect(
      apexMountLocation(
        new URL('https://tuturuuu.com/calendar/verify-token'),
        '/calendar/personal',
        production
      )
    ).toBeNull();
  });

  it('does nothing for an artifact without an apex mount', () => {
    expect(
      apexMountLocation(legacy, '/calendar/personal', {
        ...production,
        mountHosts: [],
      })
    ).toBeNull();
  });
});
