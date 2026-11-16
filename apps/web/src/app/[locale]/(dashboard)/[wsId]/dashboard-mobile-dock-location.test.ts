import { describe, expect, it } from 'vitest';
import { resolveDockLocation } from './dashboard-mobile-dock-location';

describe('resolveDockLocation', () => {
  it.each([
    ['/personal', '/personal', 'home', true, '/personal'],
    ['/en/personal', '/en/personal', 'home', true, '/en/personal'],
    ['/personal/finance/budgets', '/personal', 'home', false, '/personal'],
    ['/personal/tasks', '/personal', 'tasks', true, '/personal/tasks'],
    [
      '/vi/personal/tasks/boards/abc',
      '/vi/personal',
      'tasks',
      false,
      '/vi/personal/tasks',
    ],
    ['/personal/calendar', '/personal', 'calendar', true, '/personal/calendar'],
    ['/personal/mira/chat-1', '/personal', 'mira', false, '/personal/mira'],
  ] as const)('places %s', (pathname, base, destination, atRoot, rootHref) => {
    expect(resolveDockLocation(pathname, 'personal')).toEqual({
      base,
      destination,
      atRoot,
      rootHref,
    });
  });

  it('ignores paths outside the workspace', () => {
    expect(resolveDockLocation('/settings', 'personal')).toBeNull();
  });
});
