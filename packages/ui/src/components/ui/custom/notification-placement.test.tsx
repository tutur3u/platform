import { describe, expect, it } from 'vitest';
import { resolveNotificationPlacement } from './notification-placement';

function bellIn(container: 'aside' | 'header') {
  const root = document.createElement(container);
  const bell = document.createElement('button');
  root.append(bell);
  document.body.append(root);
  return bell;
}

describe('resolveNotificationPlacement', () => {
  it.each([1440, 1024, 768])('opens beside the sidebar rail at %ipx', (w) => {
    expect(resolveNotificationPlacement(bellIn('aside'), w)).toEqual({
      side: 'right',
      align: 'end',
    });
  });

  it('opens above the footer when the sidebar is a mobile sheet', () => {
    expect(resolveNotificationPlacement(bellIn('aside'), 390)).toEqual({
      side: 'top',
      align: 'end',
    });
  });

  it.each([390, 728, 1440])('opens below a navbar bell at %ipx', (w) => {
    expect(resolveNotificationPlacement(bellIn('header'), w)).toEqual({
      side: 'bottom',
      align: 'end',
    });
  });
});
