import { describe, expect, it } from 'vitest';
import { createCalendarApiRewrites } from './calendar-api-rewrites';

describe('calendar API ownership', () => {
  it.each(['calendar', 'calendar-hours', 'calendars'])(
    'routes the %s API family directly to Calendar',
    (family) => {
      const source = `/api/v1/workspaces/:wsId/${family}/:path*`;
      expect(
        createCalendarApiRewrites('https://calendar.example.com/')
      ).toContainEqual({
        source,
        destination: `https://calendar.example.com${source}`,
      });
    }
  );
  it('routes settings before the Web fallback', () => {
    expect(
      createCalendarApiRewrites('https://calendar.example.com')
    ).toContainEqual({
      source: '/api/v1/workspaces/:wsId/calendar-settings',
      destination:
        'https://calendar.example.com/api/v1/workspaces/:wsId/calendar-settings',
    });
  });
  it.each(['/api/v1/calendar', '/api/v1/workspaces/:wsId/calendars'])(
    'preserves the collection path %s before wildcard matching',
    (source) => {
      const rewrites = createCalendarApiRewrites('https://owner.example.com');
      const exact = rewrites.findIndex((route) => route.source === source);
      const nested = rewrites.findIndex(
        (route) => route.source === `${source}/:path*`
      );
      expect(exact).toBeGreaterThanOrEqual(0);
      expect(exact).toBeLessThan(nested);
      expect(rewrites[exact]?.destination).toBe(
        `https://owner.example.com${source}`
      );
    }
  );
  it('does not redirect host-local authentication or unrelated workspace APIs', () => {
    const rewrites = createCalendarApiRewrites('https://calendar.example.com');
    expect(rewrites.some((route) => route.source.startsWith('/api/auth'))).toBe(
      false
    );
    expect(rewrites.some((route) => route.source.includes('/wallets'))).toBe(
      false
    );
  });
});
