// @vitest-environment node

import {
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { createSatelliteApiRewrites } from './satellite-api-rewrites';

describe('createSatelliteApiRewrites', () => {
  it.each([
    '/api/v1/workspaces/workspace-1/calendar/events?start_at=2026-09-12T00%3A00%3A00Z&end_at=2026-09-19T00%3A00%3A00Z',
    '/api/v1/workspaces/workspace-1/calendar/events/event-1',
  ])('routes the real event request %s to Calendar', async (path) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://tuturuuu.com${path}`,
      nextConfig: {
        async rewrites() {
          return {
            beforeFiles: createSatelliteApiRewrites({
              calendarAppOrigin: 'https://calendar.example.com/',
              infrastructureAppOrigin: 'https://infrastructure.example.com/',
            }),
            afterFiles: [],
            fallback: [],
          };
        },
      },
    });
    expect(getRewrittenUrl(response)).toBe(
      `https://calendar.example.com${path}`
    );
  });

  it('keeps migrated dashboard dependencies available on the web origin', () => {
    expect(
      createSatelliteApiRewrites({
        calendarAppOrigin: 'https://calendar.example.com/',
        infrastructureAppOrigin: 'https://infrastructure.example.com/',
      })
    ).toEqual([
      {
        source: '/api/v1/infrastructure/ai/models',
        destination:
          'https://infrastructure.example.com/api/v1/infrastructure/ai/models',
      },
      {
        source: '/api/v1/infrastructure/resolve-workspace-id',
        destination:
          'https://infrastructure.example.com/api/v1/infrastructure/resolve-workspace-id',
      },
      {
        source: '/api/v1/workspaces/:wsId/calendar/events',
        destination:
          'https://calendar.example.com/api/v1/workspaces/:wsId/calendar/events',
      },
      {
        source: '/api/v1/workspaces/:wsId/calendar/events/:eventId',
        destination:
          'https://calendar.example.com/api/v1/workspaces/:wsId/calendar/events/:eventId',
      },
    ]);
  });
});

it.each([
  '/api/v1/users/calendar-settings',
  '/api/v1/workspaces/workspace-1/calendar-settings',
])('keeps %s on the Web route', async (path) => {
  const response = await unstable_getResponseFromNextConfig({
    url: `https://tuturuuu.com${path}`,
    nextConfig: {
      async rewrites() {
        return {
          beforeFiles: createSatelliteApiRewrites({
            calendarAppOrigin: 'https://calendar.example.com',
            infrastructureAppOrigin: 'https://infrastructure.example.com',
          }),
          afterFiles: [],
          fallback: [],
        };
      },
    },
  });
  expect(getRewrittenUrl(response)).toBeNull();
});

describe('staging rewrite origins', () => {
  const staging = { NEXT_PUBLIC_TUTURUUU_STAGING: '1' };
  const good = {
    calendarAppOrigin: 'https://calendar.staging.tutur3u.com',
    infrastructureAppOrigin: 'https://infrastructure.staging.tutur3u.com/',
  };
  it('accepts exact staging origins in a staging build', () => {
    expect(createSatelliteApiRewrites(good, staging)).toHaveLength(4);
  });
  it.each([
    'https://calendar.tuturuuu.com',
    'https://tuturuuu.com',
    'http://calendar.staging.tutur3u.com',
    'https://calendar.staging.tutur3u.com:8443',
    'https://calendar.staging.tutur3u.com/path',
    'https://a.b.staging.tutur3u.com',
    'https://calendar.staging.tutur3u.com.evil.test',
    'https://calendar-tuturuuu.vercel.app',
    'not a url',
  ])('fails a staging build that rewrites to %s', (calendarAppOrigin) => {
    expect(() =>
      createSatelliteApiRewrites({ ...good, calendarAppOrigin }, staging)
    ).toThrow(/staging\.tutur3u\.com origin/);
  });
  it('leaves production builds unchanged', () => {
    expect(
      createSatelliteApiRewrites(
        {
          calendarAppOrigin: 'https://calendar.tuturuuu.com',
          infrastructureAppOrigin: 'https://infrastructure.tuturuuu.com',
        },
        {}
      )
    ).toHaveLength(4);
  });
});
