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
    ['/personal/mira/chat-1', '/personal', 'home', false, '/personal'],
  ] as const)('places %s', (pathname, base, destination, atRoot, rootHref) => {
    expect(resolveDockLocation(pathname, 'personal')).toMatchObject({
      base,
      destination,
      atRoot,
      rootHref,
    });
  });

  it.each([
    ['/personal', '/personal'],
    ['/vi/team-a/tasks', '/vi/personal'],
    ['/en/team-a', '/en/personal'],
  ] as const)('sends Mira from %s to %s', (pathname, miraHref) => {
    const wsId = pathname.includes('team-a') ? 'team-a' : 'personal';
    expect(resolveDockLocation(pathname, wsId)?.miraHref).toBe(miraHref);
  });

  it('ignores paths outside the workspace', () => {
    expect(resolveDockLocation('/settings', 'personal')).toBeNull();
  });
});
