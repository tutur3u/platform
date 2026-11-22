import { describe, expect, it } from 'vitest';
import {
  normalizeSidebarBehavior,
  opensAsOverlay,
  restsCollapsed,
  SIDEBAR_BEHAVIORS,
} from './sidebar-behavior';

describe('sidebar behavior', () => {
  it('offers minimal and no hidden mode', () => {
    expect(SIDEBAR_BEHAVIORS).toEqual([
      'expanded',
      'collapsed',
      'hover',
      'minimal',
    ]);
  });

  it.each(SIDEBAR_BEHAVIORS)('keeps %s as it is', (behavior) => {
    expect(normalizeSidebarBehavior(behavior)).toBe(behavior);
  });

  it('reads the retired hidden value as minimal', () => {
    expect(normalizeSidebarBehavior('hidden')).toBe('minimal');
  });

  it.each([
    undefined,
    null,
    '',
    'Hidden',
    'floating',
    1,
    {},
  ])('rejects %j', (value) => {
    expect(normalizeSidebarBehavior(value)).toBeNull();
  });

  it('rests collapsed in every mode but expanded', () => {
    expect(SIDEBAR_BEHAVIORS.filter(restsCollapsed)).toEqual([
      'collapsed',
      'hover',
      'minimal',
    ]);
    expect(restsCollapsed(undefined)).toBe(false);
  });

  it('opens over the page in hover and minimal modes', () => {
    expect(SIDEBAR_BEHAVIORS.filter(opensAsOverlay)).toEqual([
      'hover',
      'minimal',
    ]);
  });
});
